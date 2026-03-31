"use client";

import { apiFetch, getWorkstationName } from '@/utils/apiClient';
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scan,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Settings,
  AlertTriangle,
  Shield,
  Package,
  X,
  ChevronDown,
  Layers,
  Eye,
  RotateCcw,
  PauseCircle,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/utils/useAuth";
import { useNavigate } from "react-router-dom";
import { logButtonClick } from "@/utils/logActivity";
import { createPortal } from "react-dom";
import { useCurrencySettings } from "@/utils/currency";
import AppFooter from "@/components/AppFooter";

const POS_PARKED_KEY = "POS_PARKED_CARTS";
const MAX_PARKED_CARTS = 25;
/** User parked manually (wait list) */
const PARK_STATUS_PAUSED = "paused";
/** Payment attempt failed — cart saved for retry */
const PARK_STATUS_FAILED = "payment_failed";
/** M-Pesa STK sent; sale pending until customer pays (or callback/mock completes) */
const PARK_STATUS_AWAITING = "awaiting_payment";

function newParkedId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `park_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Clamp product lines to current stock; services pass through. */
function reconcileCartWithProducts(cartItems, products) {
  if (!Array.isArray(cartItems)) return [];
  if (!Array.isArray(products)) return cartItems.map((x) => ({ ...x }));
  const next = [];
  for (const item of cartItems) {
    if (item.service_id || item.is_service) {
      next.push({ ...item });
      continue;
    }
    const p = products.find((pr) => pr.id === item.product_id);
    if (!p) {
      toast.warning(`Product unavailable`, { description: item.name });
      continue;
    }
    const stock = Number(p.stock_quantity) || 0;
    const qty = Math.min(Number(item.quantity) || 0, stock);
    if (qty <= 0) {
      toast.warning(`Out of stock`, { description: item.name });
      continue;
    }
    next.push({
      ...item,
      quantity: qty,
      stock_available: stock,
      unit_price: typeof item.unit_price === "number" ? item.unit_price : parseFloat(p.price),
      name: item.name || p.name,
    });
  }
  return next;
}

async function tauriInvoke(command, payload = {}) {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke(command, payload);
}

async function getLocalPrinters() {
  try {
    const rows = await tauriInvoke("list_local_printers");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function getLanPrinters() {
  try {
    const rows = await tauriInvoke("list_lan_printers");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function printReceiptToPrinter(printerName, receiptText) {
  await tauriInvoke("print_receipt_text", {
    printerName,
    receiptText,
  });
}

export default function POSSystem() {
  const workstationName = getWorkstationName();
  const { formatMoney, currency } = useCurrencySettings();
  const { user, store, isCashier, isAdmin, loading, authenticated, logout, checkSession, hasPermission, hasAnyPermission } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  /** Keeps latest cart for handlers; avoids setState updaters that run twice in Strict Mode. */
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  /** Cash: amount buyer handed over; change = tendered - total */
  const [cashTendered, setCashTendered] = useState("");
  /** Cash: required when change > 0 — cashier confirms change was given */
  const [cashChangeConfirmed, setCashChangeConfirmed] = useState(false);
  /** M-Pesa retry: existing pending sale — skip creating a new sale */
  const [paymentRetry, setPaymentRetry] = useState(null);
  /** Sale paid on server — cashier must confirm to clear wait list */
  const [paymentAckModal, setPaymentAckModal] = useState(null);
  const userDismissedAckRef = useRef(new Set());
  const offeredAckForSaleRef = useRef(new Set());
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [activeTab, setActiveTab] = useState("products");
  const [serviceSearchTerm, setServiceSearchTerm] = useState("");
  const [selectedService, setSelectedService] = useState(null);
  const [adjustedPrice, setAdjustedPrice] = useState("");
  const [printingPages, setPrintingPages] = useState(0);
  const [printingType, setPrintingType] = useState("bw");
  const [isMounted, setIsMounted] = useState(false);
  const [printingTypeDropdownOpen, setPrintingTypeDropdownOpen] = useState(false);
  const printingTypeDropdownRef = useRef(null);
  const [receiptPrompt, setReceiptPrompt] = useState(null);
  const [showReceiptPrintModal, setShowReceiptPrintModal] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [findingLanPrinters, setFindingLanPrinters] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [receiptPrintError, setReceiptPrintError] = useState("");
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authorizedUsername, setAuthorizedUsername] = useState('');
  const [pendingService, setPendingService] = useState(null);
  const [pendingFinalPrice, setPendingFinalPrice] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [profileDropdownPosition, setProfileDropdownPosition] = useState({ top: 0, right: 0, width: 0 });
  const profileDropdownRef = useRef(null);
  const profileButtonRef = useRef(null);
  const [shiftCountdownOpen, setShiftCountdownOpen] = useState(false);
  const [shiftCountdownSeconds, setShiftCountdownSeconds] = useState(0);
  const [shiftWarnBanner, setShiftWarnBanner] = useState('');
  const shiftWarnedRef = useRef(false);
  const shiftForcedLogoutRef = useRef(false);
  const queryClient = useQueryClient();
  
  const canEditPrices = isAdmin() || !isCashier() || hasPermission('edit_prices');

  // Helper function to check if user has edit_prices permission
  const hasEditPricesPermission = useCallback(() => {
    return hasPermission('edit_prices');
  }, [hasPermission]);

  // Redirect to login if not authenticated (auth is hydrated from login response or checkSession on refresh)
  useEffect(() => {
    if (loading) return;
    if (!authenticated || !user) {
      navigate('/login', { replace: true });
      return;
    }
    const isAdminUser = user.role === 'admin' || user.role === 'super_admin';
    const hasPermissionAccess = hasAnyPermission(['access_pos', 'edit_prices']);
    const hasPOSAccess = isAdminUser || hasPermissionAccess;
    if (!hasPOSAccess) {
      navigate('/login', { replace: true });
    }
  }, [authenticated, loading, user, navigate, hasAnyPermission]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (printingTypeDropdownRef.current && !printingTypeDropdownRef.current.contains(event.target)) {
        setPrintingTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    shiftWarnedRef.current = false;
    shiftForcedLogoutRef.current = false;
    setShiftCountdownOpen(false);
    setShiftCountdownSeconds(0);
    setShiftWarnBanner('');
  }, [user?.id]);

  useEffect(() => {
    if (!authenticated || !user) return;
    const tick = () => {
      const shiftInfo = user?.shiftInfo;
      if (!shiftInfo?.hasShift || !shiftInfo?.shiftEndsAt) {
        setShiftCountdownOpen(false);
        setShiftWarnBanner('');
        return;
      }

      const endAt = new Date(shiftInfo.shiftEndsAt).getTime();
      const hardLogoutAt = shiftInfo.hardLogoutAt
        ? new Date(shiftInfo.hardLogoutAt).getTime()
        : endAt + 30_000 + Number(shiftInfo.extensionMs || 0);
      const now = Date.now();
      const remainingToEnd = endAt - now;

      if (remainingToEnd > 0 && remainingToEnd <= 10 * 60 * 1000) {
        const mins = Math.max(1, Math.ceil(remainingToEnd / 60000));
        setShiftWarnBanner(`Shift ends in about ${mins} minute${mins === 1 ? '' : 's'}.`);
        if (!shiftWarnedRef.current) {
          shiftWarnedRef.current = true;
          toast.warning('Shift ending soon', { description: `You have about ${mins} minute${mins === 1 ? '' : 's'} left.` });
        }
      } else {
        setShiftWarnBanner('');
      }

      if (now > endAt && now < hardLogoutAt) {
        setShiftCountdownOpen(true);
        setShiftCountdownSeconds(Math.max(0, Math.ceil((hardLogoutAt - now) / 1000)));
        return;
      }

      if (now >= hardLogoutAt) {
        setShiftCountdownOpen(false);
        if (!shiftForcedLogoutRef.current) {
          shiftForcedLogoutRef.current = true;
          toast.error('Shift time expired. Logging out now.');
          void logout();
        }
        return;
      }

      setShiftCountdownOpen(false);
      setShiftCountdownSeconds(0);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [authenticated, user, logout]);

  const extendShiftWindow = async () => {
    try {
      const r = await apiFetch('/api/auth/shift-extend', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.success) {
        throw new Error(d?.error || 'Could not extend shift time');
      }
      toast.success('Added 10 minutes to this session.');
      setShiftCountdownOpen(false);
      await checkSession();
    } catch (err) {
      toast.error(/** @type {Error} */ (err).message || 'Shift extension failed');
    }
  };

  // Cart persistence
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedCart = localStorage.getItem('POS_CART');
    if (!savedCart) {
      setCart([]);
      return;
    }
    try {
      const parsedCart = JSON.parse(savedCart);
      if (!Array.isArray(parsedCart) || parsedCart.length === 0) {
        localStorage.removeItem('POS_CART');
        setCart([]);
        return;
      }
      const validCart = parsedCart.filter(item => 
        item && 
        typeof item === 'object' &&
        (item.product_id || item.service_id) && 
        typeof item.name === 'string' &&
        item.name.trim() !== '' &&
        typeof item.unit_price === 'number' &&
        item.unit_price > 0 &&
        typeof item.quantity === 'number' &&
        item.quantity > 0
      );
      if (validCart.length > 0) {
        setCart(validCart);
      } else {
        localStorage.removeItem('POS_CART');
        setCart([]);
      }
    } catch (error) {
      console.error('Error parsing cart from localStorage:', error);
      localStorage.removeItem('POS_CART');
      setCart([]);
    }
  }, []);

  const [isInitialMount, setIsInitialMount] = useState(true);
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }
    if (typeof window === 'undefined') return;
    if (cart.length > 0) {
      localStorage.setItem('POS_CART', JSON.stringify(cart));
    } else {
      localStorage.removeItem('POS_CART');
    }
  }, [cart, isInitialMount]);

  // Fetch products & services (must run before callbacks that reference `products`, e.g. resumeParkedCart)
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      const response = await apiFetch(`/api/products?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      return response.json();
    },
  });

  const { data: services = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ["services", serviceSearchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceSearchTerm) params.append("search", serviceSearchTerm);
      const response = await apiFetch(`/api/services?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch services");
      }
      return response.json();
    },
  });

  // —— Parked carts (wait list) ——
  const [parkedCarts, setParkedCarts] = useState([]);
  const parkedCartsRef = useRef(parkedCarts);
  parkedCartsRef.current = parkedCarts;
  const [showParkedModal, setShowParkedModal] = useState(false);
  const [detailParkedId, setDetailParkedId] = useState(null);
  const skipParkedPersist = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(POS_PARKED_KEY);
      if (!raw) {
        setParkedCarts([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(POS_PARKED_KEY);
        setParkedCarts([]);
        return;
      }
      const valid = parsed
        .filter((p) => p && typeof p.id === "string" && Array.isArray(p.items))
        .map((p) => ({
          ...p,
          createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
          label: typeof p.label === "string" ? p.label : "Parked cart",
          status:
            p.status === PARK_STATUS_FAILED
              ? PARK_STATUS_FAILED
              : p.status === PARK_STATUS_AWAITING
                ? PARK_STATUS_AWAITING
                : PARK_STATUS_PAUSED,
        }));
      setParkedCarts(valid);
    } catch {
      localStorage.removeItem(POS_PARKED_KEY);
      setParkedCarts([]);
    }
  }, []);

  useEffect(() => {
    if (skipParkedPersist.current) {
      skipParkedPersist.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(POS_PARKED_KEY, JSON.stringify(parkedCarts));
    } catch (e) {
      console.error("Failed to persist parked carts:", e);
    }
  }, [parkedCarts]);

  /** Save cart to wait list after a failed payment (or full sale/STK failure). Returns false if wait list is full. */
  const parkCartAfterFailure = useCallback(
    (snapshot, meta = {}) => {
      if (parkedCarts.length >= MAX_PARKED_CARTS) {
        toast.error("Wait list full", {
          description: `Cannot save failed payment (max ${MAX_PARKED_CARTS}). Remove a parked cart first.`,
        });
        return false;
      }
      const pm = meta.paymentMethod || "";
      const label =
        meta.label ||
        (pm
          ? `Failed ${pm}${meta.pendingSaleId ? ` · Sale #${meta.pendingSaleId}` : ""} · ${new Date().toLocaleString()}`
          : `Failed payment · ${new Date().toLocaleString()}`);
      setParkedCarts((prev) => [
        ...prev,
        {
          id: newParkedId(),
          label,
          items: snapshot,
          createdAt: Date.now(),
          status: PARK_STATUS_FAILED,
          paymentMethod: meta.paymentMethod,
          phoneNumber: meta.phoneNumber,
          lastError: meta.lastError,
          pendingSaleId: meta.pendingSaleId,
          failedAt: Date.now(),
        },
      ]);
      return true;
    },
    [parkedCarts.length]
  );

  /** After STK is initiated — sale stays pending until M-Pesa confirms */
  const parkCartAwaitingPayment = useCallback(
    (snapshot, meta = {}) => {
      if (parkedCarts.length >= MAX_PARKED_CARTS) {
        toast.error("Wait list full", {
          description: `Cannot add pending payment (max ${MAX_PARKED_CARTS}).`,
        });
        return false;
      }
      const sid = meta.saleId;
      const label =
        meta.label ||
        `M-Pesa pending · Sale #${sid} · ${new Date().toLocaleString()}`;
      setParkedCarts((prev) => [
        ...prev,
        {
          id: newParkedId(),
          label,
          items: snapshot,
          createdAt: Date.now(),
          status: PARK_STATUS_AWAITING,
          paymentMethod: "mpesa",
          phoneNumber: meta.phoneNumber,
          pendingSaleId: sid,
          checkoutRequestId: meta.checkoutRequestId,
          totalAmount: meta.total,
          saleCompletedAwaitingAck: false,
        },
      ]);
      return true;
    },
    [parkedCarts.length]
  );

  const parkCurrentCart = useCallback(() => {
    if (parkedCarts.length >= MAX_PARKED_CARTS) {
      toast.error("Wait list full", {
        description: `Maximum ${MAX_PARKED_CARTS} parked carts. Remove one to continue.`,
      });
      return;
    }
    const current = cartRef.current;
    if (!current.length) {
      toast.info("Cart is empty");
      return;
    }
    const snapshot = JSON.parse(JSON.stringify(current));
    setParkedCarts((prev) => [
      ...prev,
      {
        id: newParkedId(),
        label: `Cart ${new Date().toLocaleString()}`,
        items: snapshot,
        createdAt: Date.now(),
        status: PARK_STATUS_PAUSED,
      },
    ]);
    setCart([]);
    toast.success("Cart saved to wait list");
  }, [parkedCarts.length]);

  const handleNewCart = useCallback(() => {
    if (cart.length === 0) {
      toast.info("Cart is already empty");
      return;
    }
    parkCurrentCart();
  }, [cart.length, parkCurrentCart]);

  const deleteParkedCart = useCallback((id) => {
    setParkedCarts((p) => p.filter((x) => x.id !== id));
    setDetailParkedId((d) => (d === id ? null : d));
    toast.success("Removed from wait list");
  }, []);

  const resumeParkedCart = useCallback(
    (id) => {
      const entry = parkedCarts.find((p) => p.id === id);
      if (!entry) return;
      if (entry.status === PARK_STATUS_FAILED && entry.pendingSaleId) {
        toast.info("Use Pay again for this cart", {
          description:
            "M-Pesa already created a sale — retry payment from Pay again (not Resume).",
        });
        return;
      }
      if (entry.status === PARK_STATUS_AWAITING) {
        toast.info("This sale is awaiting M-Pesa", {
          description:
            "The customer may still be paying. Check the wait list for status or wait for the confirmation prompt.",
        });
        return;
      }

      const applyResume = () => {
        const rec = reconcileCartWithProducts(entry.items, products);
        if (rec.length === 0) {
          toast.error("Could not resume cart", {
            description: "No line items could be restored (check stock).",
          });
          setParkedCarts((p) => p.filter((x) => x.id !== id));
          setDetailParkedId(null);
          return;
        }
        setCart(rec);
        setParkedCarts((p) => p.filter((x) => x.id !== id));
        setShowParkedModal(false);
        setDetailParkedId(null);
        toast.success("Cart resumed");
      };

      if (cart.length > 0) {
        if (parkedCarts.length >= MAX_PARKED_CARTS) {
          toast.error("Wait list full", {
            description: "Finish payment, delete a parked cart, or clear the current cart first.",
          });
          return;
        }
        const snapshot = JSON.parse(JSON.stringify(cart));
        setParkedCarts((prev) => [
          ...prev,
          {
            id: newParkedId(),
            label: `Cart ${new Date().toLocaleString()}`,
            items: snapshot,
            createdAt: Date.now(),
            status: PARK_STATUS_PAUSED,
          },
        ]);
        toast.info("Previous cart moved to wait list");
      }
      applyResume();
    },
    [parkedCarts, cart.length, products]
  );

  /** Load parked cart and open payment (prefill method/phone; M-Pesa sale retry if applicable). */
  const payAgainFromParked = useCallback(
    (id) => {
      const entry = parkedCarts.find((p) => p.id === id);
      if (!entry) return;
      if (entry.status === PARK_STATUS_AWAITING) {
        toast.info("This sale is already waiting for M-Pesa.", {
          description: "Wait for payment or use Confirm receipt when it completes.",
        });
        return;
      }

      const run = () => {
        const rec = reconcileCartWithProducts(entry.items, products);
        if (rec.length === 0) {
          toast.error("Could not restore cart", {
            description: "No line items could be restored (check stock).",
          });
          return;
        }
        setCart(rec);
        setPaymentMethod(entry.paymentMethod || "");
        setPhoneNumber(entry.phoneNumber || "");
        setPaymentRetry(
          entry.pendingSaleId
            ? { parkedId: id, pendingSaleId: entry.pendingSaleId }
            : null
        );
        setShowParkedModal(false);
        setDetailParkedId(null);
        setShowPayment(true);
        toast.info(
          entry.pendingSaleId
            ? `Retry M-Pesa for sale #${entry.pendingSaleId} — no new sale will be created.`
            : "Review payment and tap Complete sale."
        );
      };

      if (cart.length > 0) {
        if (parkedCarts.length >= MAX_PARKED_CARTS) {
          toast.error("Wait list full", {
            description: "Clear or park the current cart before paying from the list.",
          });
          return;
        }
        const snapshot = JSON.parse(JSON.stringify(cart));
        setParkedCarts((prev) => [
          ...prev,
          {
            id: newParkedId(),
            label: `Cart ${new Date().toLocaleString()}`,
            items: snapshot,
            createdAt: Date.now(),
            status: PARK_STATUS_PAUSED,
          },
        ]);
        toast.info("Current cart moved to wait list");
      }
      run();
    },
    [parkedCarts, cart.length, products]
  );

  const parkedDetail = detailParkedId
    ? parkedCarts.find((p) => p.id === detailParkedId)
    : null;

  const sumParkedItems = (items) =>
    (items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  const openPaymentAckForEntry = useCallback((entry) => {
    if (!entry?.pendingSaleId) return;
    userDismissedAckRef.current.delete(entry.pendingSaleId);
    offeredAckForSaleRef.current.delete(entry.pendingSaleId);
    setPaymentAckModal({
      parkedId: entry.id,
      saleId: entry.pendingSaleId,
      payerName: entry.payerNameResolved || entry.phoneNumber || "Customer",
      total: entry.totalAmount ?? sumParkedItems(entry.items),
      phone: entry.phoneNumber,
    });
  }, []);

  const confirmPaymentAck = useCallback(() => {
    if (!paymentAckModal) return;
    const sid = paymentAckModal.saleId;
    const name = paymentAckModal.payerName;
    const matched = parkedCartsRef.current.find((x) => x.id === paymentAckModal.parkedId);
    setParkedCarts((p) => p.filter((x) => x.id !== paymentAckModal.parkedId));
    offeredAckForSaleRef.current.delete(sid);
    userDismissedAckRef.current.delete(sid);
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setReceiptPrompt({
      saleId: sid,
      paymentMethod: "mpesa",
      total: paymentAckModal.total || sumParkedItems(matched?.items || []),
      items: matched?.items || [],
    });
    setPaymentAckModal(null);
    toast.success("Transaction confirmed", {
      description: `Sale #${sid} — recorded for ${name}.`,
    });
  }, [paymentAckModal, queryClient, sumParkedItems]);

  const dismissPaymentAck = useCallback(() => {
    if (!paymentAckModal) return;
    userDismissedAckRef.current.add(paymentAckModal.saleId);
    setPaymentAckModal(null);
    toast.info("Confirm later from the wait list when you’re ready.");
  }, [paymentAckModal]);

  // Poll pending M-Pesa sales (multiple can be in flight)
  useEffect(() => {
    const poll = async () => {
      const awaiting = parkedCartsRef.current.filter(
        (p) =>
          p.status === PARK_STATUS_AWAITING &&
          p.pendingSaleId &&
          !p.saleCompletedAwaitingAck
      );
      if (awaiting.length === 0) return;
      for (const p of awaiting) {
        try {
          const res = await apiFetch(`/api/sales/${p.pendingSaleId}`);
          if (!res.ok) continue;
          const sale = await res.json();
          if (sale.payment_status === "completed") {
            setParkedCarts((prev) =>
              prev.map((e) =>
                e.id === p.id
                  ? {
                      ...e,
                      saleCompletedAwaitingAck: true,
                      payerNameResolved: sale.mpesa_payer_name || e.payerNameResolved,
                      totalAmount: Number(sale.total_amount) || e.totalAmount,
                    }
                  : e
              )
            );
          } else if (sale.payment_status === "failed") {
            setParkedCarts((prev) =>
              prev.map((e) =>
                e.id === p.id
                  ? {
                      ...e,
                      status: PARK_STATUS_FAILED,
                      lastError: "M-Pesa declined, cancelled, or timed out",
                      failedAt: Date.now(),
                    }
                  : e
              )
            );
          }
        } catch {
          /* ignore */
        }
      }
    };

    poll();
    const id = setInterval(poll, 2500);
    return () => clearInterval(id);
  }, [parkedCarts]);

  // Open confirmation modal when a pending sale completes (once per sale until dismissed)
  useEffect(() => {
    const entry = parkedCarts.find(
      (x) =>
        x.saleCompletedAwaitingAck &&
        x.pendingSaleId &&
        !userDismissedAckRef.current.has(x.pendingSaleId)
    );
    if (!entry || paymentAckModal) return;
    if (offeredAckForSaleRef.current.has(entry.pendingSaleId)) return;

    offeredAckForSaleRef.current.add(entry.pendingSaleId);
    setPaymentAckModal({
      parkedId: entry.id,
      saleId: entry.pendingSaleId,
      payerName: entry.payerNameResolved || entry.phoneNumber || "Customer",
      total: entry.totalAmount ?? sumParkedItems(entry.items),
      phone: entry.phoneNumber,
    });
  }, [parkedCarts, paymentAckModal]);

  const fetchProductByBarcode = useCallback(async (barcode) => {
    try {
      const response = await apiFetch(`/api/products/barcode/${barcode}`);
      if (!response.ok) {
        throw new Error("Product not found");
      }
      return response.json();
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
      return null;
    }
  }, []);

  const createSaleMutation = useMutation({
    mutationFn: async ({ items, payment_method, mpesa_transaction_id }) => {
      const response = await apiFetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, payment_method, mpesa_transaction_id }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create sale");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const stkPushMutation = useMutation({
    mutationFn: async ({ phone_number, amount, sale_id }) => {
      const response = await apiFetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number, amount, sale_id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || "Payment failed");
      }
      if (data.success === false) {
        throw new Error(data.message || "M-Pesa payment failed");
      }
      return data;
    },
  });

  const handleBarcodeSubmit = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    const product = await fetchProductByBarcode(barcodeInput.trim());
    if (product) {
      addToCart(product);
      setBarcodeInput("");
      toast.success('Product added to cart', {
        description: `${product.name} has been added to your cart.`,
      });
    } else {
      toast.error('Product not found', {
        description: 'No product found with that barcode. Please try again.',
      });
    }
  }, [barcodeInput, fetchProductByBarcode]);

  const addToCart = useCallback((product) => {
    logButtonClick('Add to Cart', `Add ${product.name} to cart`, {
      product_id: product.id,
      product_name: product.name,
      quantity: 1
    });

    // Determine expiry status if present
    let isExpired = false;
    let isAboutToExpire = false;
    if (product.expiry_date) {
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const exp = new Date(product.expiry_date);
      const expMidnight = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
      const diffMs = expMidnight.getTime() - todayMidnight.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays < 0) {
        isExpired = true;
      } else if (diffDays >= 0 && diffDays <= 30) {
        isAboutToExpire = true;
      }
    }

    if (isExpired) {
      toast.warning('Expired product added', {
        description: `${product.name} is past its expiry date. Replace it and report to the admin.`,
      });
    } else if (isAboutToExpire) {
      toast.info('Product near expiry', {
        description: `${product.name} is close to its expiry date. Use with caution and inform admin if needed.`,
      });
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.product_id === product.id,
      );
      if (existingItem) {
        if (existingItem.quantity >= product.stock_quantity) {
          toast.warning('Stock limit reached', {
            description: `Only ${product.stock_quantity} items available in stock.`,
          });
          return prevCart;
        }
        return prevCart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, isExpired: item.isExpired || isExpired, isAboutToExpire: item.isAboutToExpire || isAboutToExpire }
            : item,
        );
      } else {
        if (product.stock_quantity === 0) {
          toast.error('Product out of stock', {
            description: `${product.name} is currently out of stock.`,
          });
          return prevCart;
        }
        return [
          ...prevCart,
          {
            product_id: product.id,
            name: product.name,
            unit_price: product.price,
            quantity: 1,
            stock_available: product.stock_quantity,
            isExpired,
            isAboutToExpire,
          },
        ];
      }
    });
  }, []);

  const handleServiceClick = useCallback((service) => {
    if (service.price_type === 'adjustable' || service.price_type === 'calculated') {
      setSelectedService(service);
      setAdjustedPrice(service.price.toString());
      setPrintingPages(0);
    } else {
      setCart((prevCart) => {
        const existingItem = prevCart.find(
          (item) => item.service_id === service.id,
        );
        if (existingItem) {
          return prevCart.map((item) =>
            item.service_id === service.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        } else {
          return [
            ...prevCart,
            {
              service_id: service.id,
              name: service.name,
              unit_price: parseFloat(service.price),
              quantity: 1,
              is_service: true,
              original_price: service.price,
            },
          ];
        }
      });
    }
  }, []);

  const addServiceToCartDirect = useCallback((service, finalPrice) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.service_id === service.id,
      );
      if (existingItem) {
        return prevCart.map((item) =>
          item.service_id === service.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        return [
          ...prevCart,
          {
            service_id: service.id,
            name: service.name,
            unit_price: finalPrice,
            quantity: 1,
            is_service: true,
            original_price: service.price,
          },
        ];
      }
    });
    setSelectedService(null);
    setAdjustedPrice("");
    setPrintingPages(0);
  }, []);

  const calculatePrintingPrice = useCallback(() => {
    if (!selectedService) return 0;
    const priceConfig = selectedService.price_config || '';
    const pages = printingPages || 0;
    let pricePerPage = 0.5;
    if (printingType === 'color') {
      pricePerPage = 2.0;
    } else {
      pricePerPage = 0.5;
    }
    const bwMatch = priceConfig.match(/\$?(\d+\.?\d*).*black.*white/i);
    const colorMatch = priceConfig.match(/\$?(\d+\.?\d*).*color/i);
    if (printingType === 'color' && colorMatch) {
      pricePerPage = parseFloat(colorMatch[1]);
    } else if (printingType === 'bw' && bwMatch) {
      pricePerPage = parseFloat(bwMatch[1]);
    }
    return pages * pricePerPage;
  }, [selectedService, printingPages, printingType]);

  const handleAdminPasswordSubmit = useCallback(async () => {
    const isAdminUser = isAdmin();
    const hasEditPrices = hasEditPricesPermission();
    
    // If user doesn't have permission, require both username and password
    if (!hasEditPrices && !isAdminUser) {
      if (!authorizedUsername || !adminPassword) {
        toast.error('Please enter authorized user username and password');
        return;
      }
    } else {
      if (!adminPassword) {
        toast.error('Please enter password');
        return;
      }
    }

    if (!pendingService || pendingFinalPrice === null) {
      toast.error('Missing service information');
      return;
    }

    try {
      // Verify password (admin or user with edit_prices permission)
      const response = await apiFetch('/api/auth/verify-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          password: adminPassword,
          username: (hasEditPrices || isAdminUser) ? user?.username : authorizedUsername
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Log authorization activity
        const authorizedBy = data.verified_user || user?.username;
        const authorizedByName = data.verified_user_name || authorizedBy;
        const authorizedById = data.verified_user_id;
        const isSelfAuthorization = (hasEditPrices || isAdminUser) && authorizedBy === user?.username;
        
        // Log in the authorizer's activity log (if different user authorized)
        if (!isSelfAuthorization && authorizedById) {
          try {
            await apiFetch('/api/auth/log-authorization-for-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                user_id: authorizedById,
                action_type: 'authorize_price_change',
                action_description: `Authorized price change for ${pendingService?.name} from ${formatMoney(parseFloat(pendingService?.price || 0))} to ${formatMoney(pendingFinalPrice)}`,
                metadata: {
                  authorized_action: 'price_change',
                  service_id: pendingService?.id,
                  service_name: pendingService?.name,
                  original_price: pendingService?.price,
                  negotiated_price: pendingFinalPrice,
                  authorized_for: user?.username || user?.fullName,
                  authorized_for_user_id: user?.id
                }
              })
            });
          } catch (logError) {
            console.error('Error logging authorization:', logError);
          }
        }
        
        // Log in cashier's activity log (if they prompted the change)
        if (!isSelfAuthorization) {
          logButtonClick('Price Change Authorized', `Prompted price change for ${pendingService?.name} authorized by ${authorizedByName}`, {
            service_id: pendingService?.id,
            service_name: pendingService?.name,
            original_price: pendingService?.price,
            negotiated_price: pendingFinalPrice,
            price_difference: pendingFinalPrice - parseFloat(pendingService?.price || 0),
            authorized_by: authorizedBy,
            authorized_by_name: authorizedByName
          });
        } else {
          logButtonClick('Price Change', `Price changed for ${pendingService?.name}`, {
            service_id: pendingService?.id,
            service_name: pendingService?.name,
            original_price: pendingService?.price,
            negotiated_price: pendingFinalPrice,
            price_difference: pendingFinalPrice - parseFloat(pendingService?.price || 0)
          });
        }
        
        // Password verified, add to cart
        addServiceToCartDirect(pendingService, pendingFinalPrice);
        setShowAdminPasswordModal(false);
        setAdminPassword('');
        setAuthorizedUsername('');
        setPendingService(null);
        setPendingFinalPrice(null);
        toast.success('Price change approved');
      } else {
        // Log failed admin password verification
        logButtonClick('Admin Password Verification Failed', `Failed admin password verification for price negotiation`, {
          service_id: pendingService?.id,
          service_name: pendingService?.name,
          original_price: pendingService?.price,
          attempted_price: pendingFinalPrice
        });
        toast.error('Invalid password');
        setAdminPassword('');
        setAuthorizedUsername('');
      }
    } catch (error) {
      console.error('Password verification error:', error);
      toast.error('Failed to verify password. Please try again.');
    }
  }, [adminPassword, authorizedUsername, pendingService, pendingFinalPrice, addServiceToCartDirect, user, hasEditPricesPermission, isAdmin]);

  const confirmAddService = useCallback(() => {
    if (!selectedService) return;
    let finalPrice = parseFloat(adjustedPrice);
    if (selectedService.price_type === 'calculated') {
      finalPrice = calculatePrintingPrice();
    }
    if (isNaN(finalPrice) || finalPrice <= 0) {
      toast.error('Invalid price', {
        description: 'Please enter a valid price greater than 0.',
      });
      return;
    }

    logButtonClick('Add Service to Cart', `Add ${selectedService.name} to cart`, {
      service_id: selectedService.id,
      service_name: selectedService.name,
      price: finalPrice,
      original_price: selectedService.price,
      price_changed: finalPrice !== parseFloat(selectedService.price)
    });

    // If price changed and user is cashier, require admin password
    if (isCashier() && selectedService.price_type === 'adjustable' && finalPrice !== parseFloat(selectedService.price)) {
      setPendingService(selectedService);
      setPendingFinalPrice(finalPrice);
      setShowAdminPasswordModal(true);
      setAdminPassword('');
      return;
    }

    addServiceToCartDirect(selectedService, finalPrice);
  }, [selectedService, adjustedPrice, calculatePrintingPrice, addServiceToCartDirect, isCashier]);

  const updateCartQuantity = useCallback((itemId, newQuantity, isService = false) => {
    const item = cart.find(item => 
      isService ? item.service_id === itemId : item.product_id === itemId
    );
    
    if (newQuantity <= 0) {
      logButtonClick('Remove from Cart', `Remove ${isService ? 'service' : 'product'} from cart`, {
        item_id: itemId,
        item_name: item?.name,
        is_service: isService
      });
      setCart((prevCart) =>
        prevCart.filter((item) => 
          isService ? item.service_id !== itemId : item.product_id !== itemId
        ),
      );
    } else {
      logButtonClick('Update Cart Quantity', `Update ${isService ? 'service' : 'product'} quantity in cart`, {
        item_id: itemId,
        item_name: item?.name,
        old_quantity: item?.quantity,
        new_quantity: newQuantity,
        is_service: isService
      });
      setCart((prevCart) =>
        prevCart.map((item) => {
          const isTargetItem = isService 
            ? item.service_id === itemId 
            : item.product_id === itemId;
          if (isTargetItem) {
            if (!isService && newQuantity > item.stock_available) {
              toast.warning('Stock limit reached', {
                description: `Only ${item.stock_available} items available in stock.`,
              });
              return item;
            }
            return { ...item, quantity: newQuantity };
          }
          return item;
        }),
      );
    }
  }, []);

  const total = cart.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );

  const cashTenderedNum = (() => {
    const n = parseFloat(String(cashTendered).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  })();
  const cashChangeAmount =
    paymentMethod === "cash"
      ? Math.max(0, Math.round((cashTenderedNum - total) * 100) / 100)
      : 0;
  const cashSufficient = paymentMethod !== "cash" || cashTenderedNum >= total - 1e-9;
  const cashNeedsChangeConfirm = paymentMethod === "cash" && cashSufficient && cashChangeAmount > 0.005;
  const cashCanComplete =
    paymentMethod !== "cash" ||
    (cashSufficient && (!cashNeedsChangeConfirm || cashChangeConfirmed));

  const closePaymentUi = useCallback(() => {
    setShowPayment(false);
    setPaymentMethod("");
    setPhoneNumber("");
    setPaymentRetry(null);
    setCashTendered("");
    setCashChangeConfirmed(false);
  }, []);

  useEffect(() => {
    if (paymentMethod !== "cash") {
      setCashTendered("");
      setCashChangeConfirmed(false);
    }
  }, [paymentMethod]);

  const formatReceiptText = useCallback(
    (receipt) => {
      if (!receipt) return "";
      const now = new Date();
      const lines = [
        "DREAMNET POS RECEIPT",
        "------------------------------",
        `Sale #: ${receipt.saleId ?? "-"}`,
        `Date: ${now.toLocaleString()}`,
        `Cashier: ${user?.fullName || user?.username || "Staff"}`,
        `Store: ${store?.name || "Main Store"}`,
        `Payment: ${receipt.paymentMethod || "-"}`,
        "------------------------------",
      ];
      (receipt.items || []).forEach((it) => {
        const qty = Number(it.quantity) || 0;
        const unit = Number(it.unit_price) || 0;
        const rowTotal = qty * unit;
        lines.push(`${it.name || "Item"} x${qty}  ${formatMoney(rowTotal)}`);
      });
      lines.push("------------------------------");
      lines.push(`TOTAL: ${formatMoney(Number(receipt.total) || 0)}`);
      lines.push("");
      lines.push("Thank you for your purchase.");
      return lines.join("\n");
    },
    [formatMoney, store?.name, user?.fullName, user?.username]
  );

  const openPrinterSelection = useCallback(async () => {
    setLoadingPrinters(true);
    setReceiptPrintError("");
    try {
      const local = await getLocalPrinters();
      setAvailablePrinters(local);
      setSelectedPrinter(local[0]?.name || "");
      setShowReceiptPrintModal(true);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  const findLanPrinters = useCallback(async () => {
    setFindingLanPrinters(true);
    setReceiptPrintError("");
    try {
      const lan = await getLanPrinters();
      setAvailablePrinters((prev) => {
        const map = new Map();
        [...prev, ...lan].forEach((p) => map.set(p.name, p));
        return Array.from(map.values());
      });
      if (!selectedPrinter && lan[0]?.name) setSelectedPrinter(lan[0].name);
    } finally {
      setFindingLanPrinters(false);
    }
  }, [selectedPrinter]);

  const runReceiptPrint = useCallback(async () => {
    if (!receiptPrompt) return;
    if (!selectedPrinter) {
      setReceiptPrintError("Choose a printer first.");
      return;
    }
    setPrintingReceipt(true);
    setReceiptPrintError("");
    try {
      const receiptText = formatReceiptText(receiptPrompt);
      await printReceiptToPrinter(selectedPrinter, receiptText);
      toast.success("Receipt sent to printer", {
        description: `${selectedPrinter}`,
      });
      setShowReceiptPrintModal(false);
      setReceiptPrompt(null);
    } catch (err) {
      setReceiptPrintError(err?.message || "Printing failed. Check printer and try again.");
      toast.error("Printing failed", {
        description: err?.message || "You can retry or cancel printing.",
      });
    } finally {
      setPrintingReceipt(false);
    }
  }, [formatReceiptText, receiptPrompt, selectedPrinter]);

  const handlePayment = useCallback(async () => {
    if (cart.length === 0) {
      toast.info("Cart is empty", {
        description: "Add items to your cart before completing payment.",
      });
      return;
    }

    logButtonClick("Complete Sale", `Complete sale with ${cart.length} items`, {
      payment_method: paymentMethod,
      total_amount: total,
      items_count: cart.length,
      ...(paymentMethod === "cash"
        ? {
            cash_tendered: cashTenderedNum,
            cash_change: Math.max(0, Math.round((cashTenderedNum - total) * 100) / 100),
          }
        : {}),
    });

    setIsProcessingPayment(true);
    const snapshot = JSON.parse(JSON.stringify(cartRef.current));

    try {
      // Retry M-Pesa STK — sale exists; initiate prompt again, then track as awaiting payment
      if (paymentRetry?.pendingSaleId && paymentMethod === "mpesa") {
        if (!phoneNumber?.trim()) {
          toast.error("Phone number required", {
            description: "Please enter a phone number for M-Pesa payment.",
          });
          return;
        }
        const phoneNum = phoneNumber.trim();
        let stkResult;
        try {
          stkResult = await stkPushMutation.mutateAsync({
            phone_number: phoneNum,
            amount: total,
            sale_id: paymentRetry.pendingSaleId,
          });
        } catch (err) {
          toast.error("M-Pesa retry failed", {
            description: err.message || "Try again or edit the phone number.",
          });
          return;
        }
        setParkedCarts((prev) =>
          prev.map((e) =>
            e.id === paymentRetry.parkedId
              ? {
                  ...e,
                  status: PARK_STATUS_AWAITING,
                  phoneNumber: phoneNum,
                  lastError: undefined,
                  checkoutRequestId: stkResult?.checkoutRequestID,
                  label: `M-Pesa pending · Sale #${paymentRetry.pendingSaleId}`,
                }
              : e
          )
        );
        setCart([]);
        localStorage.removeItem("POS_CART");
        closePaymentUi();
        toast.success("M-Pesa prompt sent again — awaiting customer payment.", {
          description: `Sale #${paymentRetry.pendingSaleId} stays on the wait list until paid.`,
        });
        return;
      }

      if (paymentMethod === "mpesa") {
        if (!phoneNumber?.trim()) {
          toast.error("Phone number required", {
            description: "Please enter a phone number for M-Pesa payment.",
          });
          return;
        }
        const phoneNum = phoneNumber.trim();

        let sale;
        try {
          sale = await createSaleMutation.mutateAsync({
            items: cart,
            payment_method: "mpesa",
          });
        } catch (err) {
          const saved = parkCartAfterFailure(snapshot, {
            paymentMethod: "mpesa",
            phoneNumber: phoneNum,
            lastError: err.message,
            label: `M-Pesa · sale not created · ${new Date().toLocaleString()}`,
          });
          if (saved) {
            setCart([]);
            localStorage.removeItem("POS_CART");
            closePaymentUi();
          }
          toast.error("Could not create sale", { description: err.message });
          return;
        }

        let stkResult;
        try {
          stkResult = await stkPushMutation.mutateAsync({
            phone_number: phoneNum,
            amount: total,
            sale_id: sale.id,
          });
        } catch (err) {
          const saved = parkCartAfterFailure(snapshot, {
            paymentMethod: "mpesa",
            phoneNumber: phoneNum,
            lastError: err.message,
            pendingSaleId: sale.id,
            label: `M-Pesa failed · Sale #${sale.id} · ${new Date().toLocaleString()}`,
          });
          if (saved) {
            setCart([]);
            localStorage.removeItem("POS_CART");
            closePaymentUi();
          }
          toast.error("Could not send M-Pesa prompt — cart saved to wait list", {
            description: err.message || "Retry from Parked carts → Pay again.",
          });
          return;
        }

        const savedAwait = parkCartAwaitingPayment(snapshot, {
          saleId: sale.id,
          checkoutRequestId: stkResult?.checkoutRequestID,
          phoneNumber: phoneNum,
          total,
          label: `M-Pesa awaiting · Sale #${sale.id} · ${new Date().toLocaleString()}`,
        });
        if (savedAwait) {
          setCart([]);
          localStorage.removeItem("POS_CART");
          closePaymentUi();
          toast.success("M-Pesa prompt sent — sale on wait list until payment confirms.", {
            description: `You can take other orders. We’ll notify you when ${phoneNum} completes payment.`,
          });
        } else {
          toast.error(`Wait list full — sale #${sale.id} is still pending in the system.`, {
            description: "Clear a slot on the wait list or complete a parked sale.",
          });
        }
        return;
      }

      // Cash — validate tender & change confirmation before creating sale
      if (paymentMethod === "cash") {
        const tendered = parseFloat(String(cashTendered).replace(/,/g, "")) || 0;
        if (!Number.isFinite(tendered) || tendered < total - 1e-9) {
          toast.error("Insufficient cash", {
            description: `Enter at least the sale total: ${formatMoney(total)}.`,
          });
          return;
        }
        const changeDue = Math.max(0, Math.round((tendered - total) * 100) / 100);
        if (changeDue > 0.005 && !cashChangeConfirmed) {
          toast.error("Confirm change given", {
            description: "Check the box to confirm you gave the customer their change.",
          });
          return;
        }
      }

      // Cash / card
      try {
        const sale = await createSaleMutation.mutateAsync({
          items: cart,
          payment_method: paymentMethod,
        });
        const printedItems = JSON.parse(JSON.stringify(cartRef.current || []));
        setCart([]);
        localStorage.removeItem("POS_CART");
        closePaymentUi();
        setReceiptPrompt({
          saleId: sale.id,
          paymentMethod,
          total,
          items: printedItems,
        });
        toast.success("Sale completed successfully!", {
          description: `Sale #${sale.id} via ${paymentMethod}. Total: ${formatMoney(total)}`,
        });
      } catch (err) {
        const saved = parkCartAfterFailure(snapshot, {
          paymentMethod,
          lastError: err.message,
          label: `${paymentMethod} failed · ${new Date().toLocaleString()}`,
        });
        if (saved) {
          setCart([]);
          localStorage.removeItem("POS_CART");
          closePaymentUi();
        }
        toast.error("Payment failed — cart saved to wait list", {
          description: err.message || "Retry from Parked carts.",
        });
      }
    } finally {
      setIsProcessingPayment(false);
    }
  }, [
    cart,
    paymentMethod,
    phoneNumber,
    total,
    cashTendered,
    cashChangeConfirmed,
    createSaleMutation,
    stkPushMutation,
    parkCartAfterFailure,
    parkCartAwaitingPayment,
    paymentRetry,
    closePaymentUi,
  ]);

  const handlePaymentModalOutside = useCallback(() => {
    if (isProcessingPayment) return;
    if (cartRef.current.length > 0) {
      parkCurrentCart();
      return;
    }
    closePaymentUi();
  }, [isProcessingPayment, parkCurrentCart, closePaymentUi]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (
        e.key === "Enter" &&
        document.activeElement === document.getElementById("barcode-input")
      ) {
        handleBarcodeSubmit();
      }
    };
    document.addEventListener("keypress", handleKeyPress);
    return () => document.removeEventListener("keypress", handleKeyPress);
  }, [handleBarcodeSubmit]);

  // Calculate profile dropdown position
  useEffect(() => {
    if (profileDropdownOpen && profileButtonRef.current) {
      const updatePosition = () => {
        if (profileButtonRef.current) {
          const rect = profileButtonRef.current.getBoundingClientRect();
          setProfileDropdownPosition({
            top: rect.bottom,
            right: window.innerWidth - rect.right,
            width: Math.max(rect.width, 200)
          });
        }
      };
      updatePosition();
      
      let rafId;
      const handleScroll = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(updatePosition);
      };
      
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', updatePosition);
      
      let parent = profileButtonRef.current.parentElement;
      const scrollableParents = [];
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflow;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') {
          scrollableParents.push(parent);
          parent.addEventListener('scroll', handleScroll, true);
        }
        parent = parent.parentElement;
      }
      
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', updatePosition);
        scrollableParents.forEach(el => {
          el.removeEventListener('scroll', handleScroll, true);
        });
      };
    } else {
      // Reset position when closed
      setProfileDropdownPosition({ top: 0, right: 0, width: 0 });
    }
  }, [profileDropdownOpen]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!profileDropdownOpen) return;
    
    let isScrolling = false;
    let scrollTimeout;
    
    const handleScrollStart = () => {
      isScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 150);
    };
    
    const handleClickOutside = (event) => {
      if (isScrolling) return;
      
      const dropdownElement = document.querySelector('[data-profile-dropdown]');
      const clickedDropdown = dropdownElement && (dropdownElement.contains(event.target) || dropdownElement === event.target);
      const clickedButton = profileButtonRef.current && profileButtonRef.current.contains(event.target);
      
      if (!clickedButton && !clickedDropdown) {
        setProfileDropdownOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScrollStart, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScrollStart, true);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(scrollTimeout);
    };
  }, [profileDropdownOpen]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-analytics-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {shiftWarnBanner ? (
        <div className="mx-4 mt-3 rounded-lg border border-amber-300/70 bg-amber-50/90 px-4 py-2 text-sm text-amber-900">
          {shiftWarnBanner}
        </div>
      ) : null}
      {shiftCountdownOpen ? (
        <div className="fixed inset-0 z-[10050] bg-black/35 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-5 shadow-2xl text-center">
            <p className="text-sm font-semibold text-amber-900">Shift ended</p>
            <p className="mt-2 text-sm text-gray-700">
              You will be logged out in
            </p>
            <p className="mt-1 text-4xl font-black text-red-600 tabular-nums">{shiftCountdownSeconds}s</p>
            <p className="mt-2 text-xs text-gray-600">
              Add 10 minutes if you need to wrap up this sale.
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-amber-600 text-white py-2.5 font-semibold hover:bg-amber-700"
              onClick={() => void extendShiftWindow()}
            >
              Add 10 minutes
            </button>
          </div>
        </div>
      ) : null}
      {/* Header */}
      <div className="glass-card mb-6 mx-4 mt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold heading-pos">
                Point of Sale System
                {workstationName ? (
                  <span className="ml-2 inline-flex items-center rounded-md bg-sky-100/70 px-2 py-0.5 text-xs font-semibold text-sky-900 align-middle">
                    {workstationName}
                  </span>
                ) : null}
              </h1>
              {store && (
                <p className="text-sm text-analytics-secondary mt-1">
                  {store.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowParkedModal(true);
                  setDetailParkedId(null);
                }}
                className="glass-button-secondary flex items-center gap-2 px-3 py-2 rounded-xl hover-glow smooth-transition text-sm font-medium"
                title="Parked carts (wait list)"
              >
                <Layers size={18} className="text-secondary-pos" />
                <span className="hidden sm:inline">Parked carts</span>
                <span className="rounded-full bg-blue-600/20 text-blue-800 dark:text-blue-100 px-2 py-0.5 text-xs font-bold">
                  {parkedCarts.length}
                </span>
              </button>
              {isAdmin() && (
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('intentional_navigation', 'true');
                    navigate('/admin');
                  }}
                  className="glass-button-primary p-2.5 hover-glow smooth-transition"
                  title="Admin Dashboard"
                >
                  <Settings size={18} className="text-secondary-pos" />
                </button>
              )}
              <div className="relative">
                <button
                  ref={profileButtonRef}
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold hover:scale-105 transition-transform cursor-pointer"
                  title="User Profile"
                >
                  {user?.fullName?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}
                </button>
                
                {profileDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div
                    data-profile-dropdown
                    ref={profileDropdownRef}
                    style={{ 
                      position: 'fixed',
                      top: `${profileDropdownPosition.top + 8}px`,
                      right: `${profileDropdownPosition.right}px`,
                      width: `${profileDropdownPosition.width || 200}px`,
                      zIndex: 10000,
                      pointerEvents: 'auto'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="glass-card-pro shadow-lg" style={{ 
                      background: 'rgba(255,255,255,0.18)',
                      borderRadius: '16px',
                      boxShadow: '0 8px 32px 0 rgba(16,9,7,0.11), 0 2px 8px 0 rgba(0,0,0,0.06)',
                      backdropFilter: 'blur(9.5px)',
                      padding: '12px',
                      minWidth: '200px',
                      width: '100%'
                    }}>
                      {/* User Info Section */}
                      <div className="pb-3 border-b border-white/10 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                            {user?.fullName?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-analytics-primary truncate">
                              {user?.fullName || user?.username}
                            </p>
                            <p className="text-xs text-analytics-secondary capitalize">
                              {user?.role?.replace('_', ' ')}
                            </p>
                            {store && (
                              <p className="text-xs text-analytics-secondary mt-1 truncate">
                                {store.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Logout Button */}
                      <button
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await logout();
                        }}
                        className="w-full glass-button-secondary px-4 py-2 rounded-lg hover-glow smooth-transition flex items-center justify-center gap-2 text-sm text-analytics-primary"
                        title="Logout"
                      >
                        <X size={18} className="text-secondary-pos" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="flex flex-col lg:flex-row h-full gap-6">
          {/* Products/Services Section */}
          <motion.div
            className="flex-1 min-w-0"
            animate={{
              width: cart.length > 0 ? "70%" : "100%",
            }}
            transition={{ type: "spring", stiffness: 70, damping: 20, duration: 0.8 }}
          >
            {/* Tab Switcher */}
            <div className="glass-card p-6 mb-6">
              <div className="flex space-x-4 mb-4">
                <button
                  onClick={() => setActiveTab("products")}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 ${
                    activeTab === "products"
                      ? "glass-button-primary shadow-lg hover-glow"
                      : "glass-button-secondary hover:shadow-md"
                  }`}
                >
                  <Package size={20} />
                  <span className="font-medium">Products</span>
                </button>
                <button
                  onClick={() => setActiveTab("services")}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 ${
                    activeTab === "services"
                      ? "glass-button-primary shadow-lg hover-glow"
                      : "glass-button-secondary hover:shadow-md"
                  }`}
                >
                  <Shield size={20} />
                  <span className="font-medium">Services</span>
                </button>
              </div>

              {activeTab === "products" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-blue-600" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="glass-input w-full pl-10 pr-4 py-3 rounded-xl"
                    />
                  </div>
                  <div className="relative">
                    <Scan className="absolute left-3 top-3 h-5 w-5 text-blue-600" />
                    <input
                      id="barcode-input"
                      type="text"
                      placeholder="Scan or enter barcode..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyPress={(e) =>
                        e.key === "Enter" && handleBarcodeSubmit()
                      }
                      className="glass-input w-full pl-10 pr-4 py-3 rounded-xl"
                    />
                  </div>
                </div>
              )}

              {activeTab === "services" && (
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-blue-600" />
                  <input
                    type="text"
                    placeholder="Search cyber services..."
                    value={serviceSearchTerm}
                    onChange={(e) => setServiceSearchTerm(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-3 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Products Grid */}
            {activeTab === "products" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold heading-pos mb-6 flex items-center gap-2">
                  <Package className="h-6 w-6 text-secondary-pos" />
                  Products
                </h2>
                {isLoading ? (
                  <div className="text-center py-8 text-secondary-pos">Loading products...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map((product) => (
                      <div
                        key={product.id}
                        className="glass-card p-5 cursor-pointer smooth-transition hover:scale-105 hover-glow group"
                        onClick={() => addToCart(product)}
                      >
                        <h3 className="font-bold text-primary-pos mb-2 group-hover:text-[#222222] transition-colors">
                          {product.name}
                        </h3>
                        <p className="text-sm text-secondary-pos mb-3">
                          {product.category}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-xl font-bold text-price-pos">
                            {formatMoney(parseFloat(product.price))}
                          </span>
                          <div className="flex items-center space-x-1">
                            {product.stock_quantity <= product.min_stock_level && (
                              <AlertTriangle
                                size={18}
                                className="text-low-stock-pos"
                              />
                            )}
                            <span
                              className={`text-sm font-medium ${
                                product.stock_quantity === 0
                                  ? "text-out-of-stock-pos"
                                  : product.stock_quantity <= product.min_stock_level
                                    ? "text-low-stock-pos"
                                    : "text-stock-pos"
                              }`}
                            >
                              Stock: {product.stock_quantity}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Services Grid */}
            {activeTab === "services" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold heading-pos mb-6 flex items-center gap-2">
                  <Shield className="h-6 w-6 text-secondary-pos" />
                  Cyber Services
                </h2>
                {isLoadingServices ? (
                  <div className="text-center py-8 text-secondary-pos">Loading services...</div>
                ) : services.length === 0 ? (
                  <div className="text-center py-8 text-secondary-pos">
                    No services found. Add services in the Admin panel.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {services.map((service) => (
                      <div
                        key={service.id}
                        className="glass-card p-5 cursor-pointer smooth-transition hover:scale-105 hover-glow group"
                        onClick={() => handleServiceClick(service)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-3 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl">
                            <Shield className="h-8 w-8 text-emerald-600" />
                          </div>
                        </div>
                        <h3 className="font-bold text-primary-pos mb-2 group-hover:text-[#222222] transition-colors">
                          {service.name}
                        </h3>
                        <div className="flex items-center space-x-2 mb-2">
                          <p className="text-sm text-price-pos">
                            {service.category}
                          </p>
                          {service.price_type === 'adjustable' && (
                            <span className="badge-negotiable">
                              Negotiable
                            </span>
                          )}
                          {service.price_type === 'calculated' && (
                            <span className="badge-calculated">
                              Calculated
                            </span>
                          )}
                        </div>
                        {service.description && (
                          <p className="text-sm text-secondary-pos mb-2 line-clamp-2">
                            {service.description}
                          </p>
                        )}
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-lg font-semibold text-price-pos">
                            {formatMoney(parseFloat(service.price))}
                          </span>
                          {service.duration && (
                            <span className="text-sm text-secondary-pos">
                              {service.duration} hrs
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Cart Section - This is a simplified version. The full cart UI would need to be restored from the original code */}
          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div
                key="cart-panel"
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0 }}
                transition={{ type: "spring", stiffness: 70, damping: 18, duration: 0.8 }}
                className="w-full lg:w-[30%]"
              >
                <div className="glass-card p-6 sticky top-6">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                    <h2 className="text-lg font-bold heading-pos">Cart</h2>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={parkCurrentCart}
                        className="glass-button-secondary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                        title="Save current cart to the wait list and clear"
                      >
                        <Layers size={14} />
                        Park cart
                      </button>
                      <button
                        type="button"
                        onClick={handleNewCart}
                        className="glass-button-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                        title="Park current cart and start a new one"
                      >
                        <RotateCcw size={14} />
                        New cart
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                    {cart.map((item) => {
                      const isService = item.is_service || item.service_id;
                      const itemId = isService ? item.service_id : item.product_id;
                      const itemTotal = parseFloat(item.unit_price) * item.quantity;
                      return (
                        <div key={itemId} className="glass-card p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-bold text-primary-pos text-sm">{item.name}</h4>
                              {isService && (
                                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
                                  Service
                                </span>
                              )}
                              {!isService && item.isExpired && (
                                <p className="mt-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                                  Expired stock — replace this item and report to your admin.
                                </p>
                              )}
                              {!isService && !item.isExpired && item.isAboutToExpire && (
                                <p className="mt-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                  Near expiry — use with caution and inform your admin if needed.
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => updateCartQuantity(itemId, 0, isService)}
                              className="p-1 rounded-lg hover:bg-red-100 text-red-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-price-pos font-bold">
                              {formatMoney(itemTotal)}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateCartQuantity(itemId, item.quantity - 1, isService)}
                                className="p-1 rounded hover:bg-red-100 text-red-600"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="w-8 text-center font-bold text-primary-pos text-sm">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateCartQuantity(itemId, item.quantity + 1, isService)}
                                className="p-1 rounded hover:bg-green-100 text-green-600"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t-2 border-gray-300 pt-4 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold heading-pos">Total:</span>
                      <span className="text-4xl font-black text-cart-total-pos">
                        {formatMoney(total)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentRetry(null);
                      setCashTendered("");
                      setCashChangeConfirmed(false);
                      setShowPayment(true);
                    }}
                    className="glass-button-primary w-full py-3 rounded-xl font-bold hover-glow"
                  >
                    <CreditCard size={16} className="inline mr-2" />
                    Proceed to Payment
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
          onMouseDown={handlePaymentModalOutside}
        >
          <div
            className="glass-card w-full max-w-sm rounded-2xl p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {paymentRetry?.pendingSaleId && (
              <div className="mb-3 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                <strong>M-Pesa retry:</strong> Sale #{paymentRetry.pendingSaleId} — only the payment step will run
                (no duplicate sale).
              </div>
            )}
            <div className="mb-3 border-b border-white/20 pb-3">
              <p className="text-4xl font-black text-cart-total-pos">{formatMoney(total)}</p>
            </div>
            <h3 className="mb-3 font-bold text-sm heading-pos">Select Payment Method</h3>

            <div className="space-y-2">
              <button
                type="button"
                disabled={!!paymentRetry?.pendingSaleId}
                onClick={() => setPaymentMethod("cash")}
                className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border-2 text-sm disabled:opacity-45 ${
                  paymentMethod === "cash"
                    ? "border-blue-600 bg-blue-100 text-blue-700"
                    : "border-gray-300 hover:border-gray-400 text-gray-700 bg-white"
                }`}
              >
                <Banknote size={16} />
                <span>Cash</span>
              </button>
              <button
                type="button"
                disabled={!!paymentRetry?.pendingSaleId}
                onClick={() => setPaymentMethod("card")}
                className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border-2 text-sm disabled:opacity-45 ${
                  paymentMethod === "card"
                    ? "border-blue-600 bg-blue-100 text-blue-700"
                    : "border-gray-300 hover:border-gray-400 text-gray-700 bg-white"
                }`}
              >
                <CreditCard size={16} />
                <span>Credit Card</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("mpesa")}
                className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border-2 text-sm ${
                  paymentMethod === "mpesa"
                    ? "border-blue-600 bg-blue-100 text-blue-700"
                    : "border-gray-300 hover:border-gray-400 text-gray-700 bg-white"
                }`}
              >
                <Smartphone size={16} />
                <span>M-Pesa</span>
              </button>
            </div>

            {paymentMethod === "mpesa" && (
              <input
                type="tel"
                placeholder="Enter phone number (254...)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="glass-input mt-3 w-full px-3 py-2 rounded-lg text-sm"
              />
            )}

            {paymentMethod === "cash" && (
              <div className="mt-3 space-y-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 dark:bg-emerald-950/20 p-3">
                <label className="block text-xs font-semibold text-analytics-secondary">
                  Cash received from customer ({currency.code})
                </label>
                <input
                  id="cash-tendered-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={cashTendered}
                  onChange={(e) => {
                    setCashTendered(e.target.value);
                    setCashChangeConfirmed(false);
                  }}
                  className="glass-input w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                  placeholder={`Minimum ${formatMoney(total)}`}
                />
                {cashTendered !== "" && (
                  <div className="space-y-2">
                    {!cashSufficient && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Insufficient: need at least <strong>{formatMoney(total)}</strong> (sale total).
                      </p>
                    )}
                    {cashSufficient && cashChangeAmount > 0.005 && (
                      <>
                        <div className="flex justify-between items-baseline gap-2 pt-1 border-t border-emerald-500/20">
                          <span className="text-sm font-medium text-analytics-secondary">Change to give back</span>
                          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {formatMoney(cashChangeAmount)}
                          </span>
                        </div>
                        <label className="flex items-start gap-2 cursor-pointer text-xs leading-snug text-primary-pos">
                          <input
                            type="checkbox"
                            checked={cashChangeConfirmed}
                            onChange={(e) => setCashChangeConfirmed(e.target.checked)}
                            className="mt-0.5 rounded border-gray-400"
                          />
                          <span>I confirm the customer received this change (required before completing the sale).</span>
                        </label>
                      </>
                    )}
                    {cashSufficient && cashChangeAmount <= 0.005 && (
                      <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                        Exact amount — no change due. You can complete the sale.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex space-x-2">
              <button
                type="button"
                onClick={closePaymentUi}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-3 rounded-lg hover:bg-gray-400 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handlePayment}
                disabled={
                  !paymentMethod || isProcessingPayment || (paymentMethod === "cash" && !cashCanComplete)
                }
                className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {isProcessingPayment ? "Processing..." : "Complete Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service Configuration Modal */}
      {selectedService && isMounted && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="glass-card shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">
                Configure {selectedService.name}
              </h3>
              <button
                onClick={() => {
                  setSelectedService(null);
                  setAdjustedPrice("");
                  setPrintingPages(0);
                }}
                className="text-gray-600 hover:text-black"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {selectedService.price_type === 'calculated' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Pages
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={printingPages}
                      onChange={(e) => setPrintingPages(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="Enter number of pages"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Printing Type
                    </label>
                    <div className="relative" ref={printingTypeDropdownRef}>
                      <button
                        onClick={() => setPrintingTypeDropdownOpen(!printingTypeDropdownOpen)}
                        className="glass-button-secondary flex items-center justify-between gap-2 w-full px-3 py-2.5 text-sm"
                      >
                        <span>{printingType === 'bw' ? 'Black & White' : 'Color'}</span>
                        <ChevronDown size={16} className={`transition-transform ${printingTypeDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {printingTypeDropdownOpen && (
                        <div className="absolute right-0 mt-2 z-50 w-full">
                          <div className="glass-card-pro overflow-hidden shadow-lg">
                            <button
                              onClick={() => {
                                setPrintingType('bw');
                                setPrintingTypeDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-white/20"
                            >
                              Black & White
                            </button>
                            <button
                              onClick={() => {
                                setPrintingType('color');
                                setPrintingTypeDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-white/20"
                            >
                              Color
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Calculated Price:</span>
                      <span className="text-lg font-semibold text-green-600">
                        {formatMoney(calculatePrintingPrice())}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Original Price
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                      <span className="text-lg font-semibold text-black">
                        {formatMoney(parseFloat(selectedService.price))}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adjusted Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={adjustedPrice}
                      onChange={(e) => setAdjustedPrice(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="Enter adjusted price"
                    />
                    {isCashier() && parseFloat(adjustedPrice) !== parseFloat(selectedService.price) && (
                      <p className="text-xs text-blue-500 mt-1">
                        {(hasEditPricesPermission() || isAdmin())
                          ? 'Your password required to change price' 
                          : 'Authorized user password required to change price'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setSelectedService(null);
                  setAdjustedPrice("");
                  setPrintingPages(0);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddService}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Add to Cart</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Modal for Price Negotiation */}
      {showAdminPasswordModal && pendingService && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="glass-card shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-black">
                Password Required
              </h3>
              <button
                onClick={() => {
                  setShowAdminPasswordModal(false);
                  setAdminPassword('');
                  setPendingService(null);
                  setPendingFinalPrice(null);
                }}
                className="text-gray-600 hover:text-black"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
                <p className="text-sm text-gray-700">
                  Are you sure you want to temporarily change the price to <span className="font-bold text-blue-600">{formatMoney(pendingFinalPrice)}</span>?
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Original price: {formatMoney(parseFloat(pendingService.price))}
                </p>
              </div>
              {/* Username field - only show for users without edit_prices permission */}
              {!(hasEditPricesPermission() || isAdmin()) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authorized User Username
                  </label>
                  <input
                    type="text"
                    value={authorizedUsername}
                    onChange={(e) => setAuthorizedUsername(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminPasswordSubmit()}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Enter authorized user username"
                    autoFocus
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {(hasEditPricesPermission() || isAdmin())
                    ? 'Your Password' 
                    : 'Authorized User Password'}
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAdminPasswordSubmit()}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  placeholder={(hasEditPricesPermission() || isAdmin())
                    ? 'Enter your password'
                    : 'Enter authorized user password'}
                  autoFocus={hasEditPricesPermission() || isAdmin()}
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAdminPasswordModal(false);
                  setAdminPassword('');
                  setAuthorizedUsername('');
                  setPendingService(null);
                  setPendingFinalPrice(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminPasswordSubmit}
                disabled={(() => {
                  const isAdminUser = isAdmin();
                  const hasEditPrices = hasEditPricesPermission();
                  if (!hasEditPrices && !isAdminUser) {
                    return !authorizedUsername || !adminPassword;
                  }
                  return !adminPassword;
                })()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parked carts (wait list) modal */}
      {showParkedModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
            onClick={() => {
              setShowParkedModal(false);
              setDetailParkedId(null);
            }}
          >
            <div
              className="relative w-full max-w-lg max-h-[88vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="glass-card-pro shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                  <h3 className="text-lg font-bold heading-pos flex items-center gap-2">
                    <Layers size={20} />
                    Parked carts ({parkedCarts.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowParkedModal(false);
                      setDetailParkedId(null);
                    }}
                    className="p-2 rounded-lg hover:bg-white/10"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 min-h-0">
                  {parkedCarts.length === 0 ? (
                    <p className="text-sm text-analytics-secondary text-center py-10 px-2">
                      Paused carts, <strong>M-Pesa awaiting payment</strong>, and failed payments appear here.
                      Multiple pending M-Pesa sales can run at once — confirm each when payment clears.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {parkedCarts.map((p) => {
                        const isFailed = p.status === PARK_STATUS_FAILED;
                        const isAwaiting = p.status === PARK_STATUS_AWAITING;
                        const mpesaRetryOnly = isFailed && p.pendingSaleId;
                        const needsAck = isAwaiting && p.saleCompletedAwaitingAck;
                        return (
                          <li
                            key={p.id}
                            className="glass-card p-3 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <p className="font-medium text-primary-pos truncate">{p.label}</p>
                                {isFailed ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                    <CircleAlert size={12} />
                                    Failed payment
                                  </span>
                                ) : isAwaiting ? (
                                  needsAck ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                      Paid — confirm
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                      <Loader2 size={12} className="animate-spin" />
                                      Awaiting M-Pesa
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 text-slate-700 dark:text-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                    <PauseCircle size={12} />
                                    Paused
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-analytics-secondary">
                                {p.items?.length ?? 0} line(s) · {formatMoney(sumParkedItems(p.items))} ·{" "}
                                {new Date(p.createdAt).toLocaleString()}
                                {p.pendingSaleId ? ` · Sale #${p.pendingSaleId}` : ""}
                                {p.phoneNumber ? ` · ${p.phoneNumber}` : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end">
                              <button
                                type="button"
                                className="glass-button-secondary text-xs px-2 py-1.5 rounded-lg flex items-center gap-1"
                                onClick={() => setDetailParkedId(p.id)}
                              >
                                <Eye size={14} />
                                View
                              </button>
                              {needsAck && (
                                <button
                                  type="button"
                                  className="glass-button-primary text-xs px-2 py-1.5 rounded-lg flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => openPaymentAckForEntry(p)}
                                >
                                  <CreditCard size={14} />
                                  Confirm receipt
                                </button>
                              )}
                              {isFailed && (
                                <button
                                  type="button"
                                  className="glass-button-primary text-xs px-2 py-1.5 rounded-lg flex items-center gap-1"
                                  onClick={() => payAgainFromParked(p.id)}
                                  title={
                                    mpesaRetryOnly
                                      ? "Retry M-Pesa for existing sale"
                                      : "Open payment for this cart"
                                  }
                                >
                                  <CreditCard size={14} />
                                  Pay again
                                </button>
                              )}
                              {!isAwaiting && (!isFailed || !mpesaRetryOnly) && (
                                <button
                                  type="button"
                                  className="glass-button-primary text-xs px-2 py-1.5 rounded-lg flex items-center gap-1"
                                  onClick={() => resumeParkedCart(p.id)}
                                >
                                  <RotateCcw size={14} />
                                  Resume
                                </button>
                              )}
                              <button
                                type="button"
                                className="text-xs px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-500/10 flex items-center gap-1"
                                onClick={() => deleteParkedCart(p.id)}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {detailParkedId && parkedDetail && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/55 p-2"
                  onClick={() => setDetailParkedId(null)}
                >
                  <div
                    className="glass-card-pro w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                      <h4 className="font-bold heading-pos truncate pr-2">{parkedDetail.label}</h4>
                      <button
                        type="button"
                        onClick={() => setDetailParkedId(null)}
                        className="p-2 rounded-lg hover:bg-white/10 shrink-0"
                        aria-label="Close detail"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 min-h-0 text-sm space-y-2">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {parkedDetail.status === PARK_STATUS_FAILED ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-semibold uppercase">
                            <CircleAlert size={12} />
                            Failed payment
                          </span>
                        ) : parkedDetail.status === PARK_STATUS_AWAITING ? (
                          parkedDetail.saleCompletedAwaitingAck ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold uppercase">
                              Paid — confirm receipt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-900 px-2 py-0.5 text-[10px] font-semibold uppercase">
                              <Loader2 size={12} className="animate-spin" />
                              Awaiting M-Pesa
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase">
                            <PauseCircle size={12} />
                            Paused
                          </span>
                        )}
                        {parkedDetail.pendingSaleId && (
                          <span className="text-xs text-analytics-secondary">
                            Pending sale #{parkedDetail.pendingSaleId}
                          </span>
                        )}
                      </div>
                      {parkedDetail.lastError && (
                        <p className="text-xs text-red-600 dark:text-red-400 mb-2 rounded-lg bg-red-500/10 px-2 py-1.5">
                          {parkedDetail.lastError}
                        </p>
                      )}
                      {(parkedDetail.items || []).map((it, idx) => (
                        <div
                          key={`${it.product_id ?? it.service_id ?? idx}-${idx}`}
                          className="flex justify-between gap-2 border-b border-white/10 pb-2 last:border-0"
                        >
                          <span className="text-primary-pos truncate">{it.name}</span>
                          <span className="text-analytics-secondary shrink-0">
                            ×{it.quantity} @ {formatMoney(Number(it.unit_price))}
                          </span>
                        </div>
                      ))}
                      <div className="pt-3 font-bold flex justify-between border-t border-white/10">
                        <span>Total</span>
                        <span>{formatMoney(sumParkedItems(parkedDetail.items))}</span>
                      </div>
                    </div>
                    <div className="p-4 border-t border-white/10 flex flex-wrap gap-2 justify-end shrink-0">
                      <button
                        type="button"
                        className="glass-button-secondary px-3 py-2 rounded-lg text-sm"
                        onClick={() => setDetailParkedId(null)}
                      >
                        Close
                      </button>
                      {parkedDetail.status === PARK_STATUS_AWAITING &&
                        parkedDetail.saleCompletedAwaitingAck && (
                          <button
                            type="button"
                            className="glass-button-primary px-3 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => {
                              setDetailParkedId(null);
                              openPaymentAckForEntry(parkedDetail);
                            }}
                          >
                            Confirm receipt
                          </button>
                        )}
                      {parkedDetail.status === PARK_STATUS_FAILED && (
                        <button
                          type="button"
                          className="glass-button-primary px-3 py-2 rounded-lg text-sm"
                          onClick={() => {
                            setDetailParkedId(null);
                            payAgainFromParked(parkedDetail.id);
                          }}
                        >
                          Pay again
                        </button>
                      )}
                      {parkedDetail.status !== PARK_STATUS_AWAITING &&
                        !(
                          parkedDetail.status === PARK_STATUS_FAILED && parkedDetail.pendingSaleId
                        ) && (
                          <button
                            type="button"
                            className="glass-button-primary px-3 py-2 rounded-lg text-sm"
                            onClick={() => resumeParkedCart(parkedDetail.id)}
                          >
                            Resume this cart
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Confirm M-Pesa completion — remove from wait list after cashier verifies */}
      {paymentAckModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => dismissPaymentAck()}
          >
            <div
              className="glass-card-pro max-w-md w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold heading-pos mb-2">Payment received</h3>
              <p className="text-sm text-analytics-secondary mb-4">
                M-Pesa reports a successful payment for this sale. Confirm to clear it from the wait list
                and mark this register step complete.
              </p>
              <div className="rounded-xl bg-white/10 p-4 mb-4 space-y-2 text-sm">
                <p>
                  <span className="text-analytics-secondary">Payer: </span>
                  <span className="font-semibold text-primary-pos text-base">
                    {paymentAckModal.payerName}
                  </span>
                </p>
                {paymentAckModal.phone && (
                  <p>
                    <span className="text-analytics-secondary">Phone: </span>
                    {paymentAckModal.phone}
                  </p>
                )}
                <p>
                  <span className="text-analytics-secondary">Sale: </span>#{paymentAckModal.saleId}
                </p>
                <p>
                  <span className="text-analytics-secondary">Amount: </span>$
                  {Number(paymentAckModal.total || 0).toFixed(2)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  className="glass-button-secondary px-4 py-2 rounded-lg text-sm"
                  onClick={dismissPaymentAck}
                >
                  Later
                </button>
                <button
                  type="button"
                  className="glass-button-primary px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700"
                  onClick={confirmPaymentAck}
                >
                  Confirm & clear wait list
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {receiptPrompt &&
        !showReceiptPrintModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[10070] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setReceiptPrompt(null)}
          >
            <div
              className="glass-card-pro max-w-md w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold heading-pos mb-2">Print receipt?</h3>
              <p className="text-sm text-analytics-secondary mb-4">
                Transaction #{receiptPrompt.saleId} is complete. You can print a receipt now or continue without printing.
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  className="glass-button-secondary px-4 py-2 rounded-lg text-sm"
                  onClick={() => setReceiptPrompt(null)}
                >
                  Continue without printing
                </button>
                <button
                  type="button"
                  className="glass-button-primary px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => void openPrinterSelection()}
                  disabled={loadingPrinters}
                >
                  {loadingPrinters ? "Loading printers..." : "Choose printer"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {showReceiptPrintModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
            onClick={() => {
              setShowReceiptPrintModal(false);
              setReceiptPrompt(null);
            }}
          >
            <div
              className="glass-card-pro max-w-lg w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold heading-pos mb-2">Print receipt</h3>
              <p className="text-sm text-analytics-secondary mb-3">
                Select a printer connected to this machine. You can also find network printers on the LAN.
              </p>
              <div className="space-y-2 max-h-52 overflow-auto rounded-lg border border-white/20 p-2 bg-white/5">
                {availablePrinters.length === 0 ? (
                  <p className="text-xs text-analytics-secondary">No printers found yet.</p>
                ) : (
                  availablePrinters.map((p) => (
                    <label
                      key={p.name}
                      className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${selectedPrinter === p.name ? "bg-white/25" : "hover:bg-white/15"}`}
                    >
                      <span className="text-primary-pos">{p.name}</span>
                      <span className="text-[11px] text-analytics-secondary">
                        {p.is_network ? "LAN" : "Local"}
                      </span>
                      <input
                        type="radio"
                        name="receipt-printer"
                        checked={selectedPrinter === p.name}
                        onChange={() => setSelectedPrinter(p.name)}
                      />
                    </label>
                  ))
                )}
              </div>
              {receiptPrintError ? (
                <p className="mt-2 text-xs text-red-600">{receiptPrintError}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  className="glass-button-secondary px-3 py-2 rounded-lg text-sm"
                  onClick={() => void findLanPrinters()}
                  disabled={findingLanPrinters}
                >
                  {findingLanPrinters ? "Finding LAN printers..." : "Find printers on LAN"}
                </button>
                <button
                  type="button"
                  className="glass-button-secondary px-3 py-2 rounded-lg text-sm"
                  onClick={() => {
                    setShowReceiptPrintModal(false);
                    setReceiptPrompt(null);
                  }}
                >
                  Cancel printing
                </button>
                <button
                  type="button"
                  className="glass-button-primary px-3 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => void runReceiptPrint()}
                  disabled={printingReceipt || !selectedPrinter}
                >
                  {printingReceipt ? "Printing..." : "Print receipt"}
                </button>
                {receiptPrintError ? (
                  <button
                    type="button"
                    className="glass-button-primary px-3 py-2 rounded-lg text-sm"
                    onClick={() => void runReceiptPrint()}
                    disabled={printingReceipt || !selectedPrinter}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )}
      <AppFooter className="mt-auto py-4 px-4 border-t border-white/10" />
    </div>
  );
}

