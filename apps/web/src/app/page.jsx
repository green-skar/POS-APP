"use client";

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/utils/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ShoppingCart,
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
  Calculator,
} from "lucide-react";

function POSSystem() {
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [activeTab, setActiveTab] = useState("products"); // 'products' or 'services'
  const [serviceSearchTerm, setServiceSearchTerm] = useState("");
  const [selectedService, setSelectedService] = useState(null);
  const [adjustedPrice, setAdjustedPrice] = useState("");
  const [printingPages, setPrintingPages] = useState(0);
  const [printingType, setPrintingType] = useState("bw"); // 'bw' for black/white, 'color' for color
  const [isMounted, setIsMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch products
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

  // Fetch services
  const { data: services = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ["services", serviceSearchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (serviceSearchTerm) params.append("search", serviceSearchTerm);

      const response = await apiFetch(`/api/services?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch services");
      }
      const data = await response.json();
      console.log('Fetched services:', data.length, 'services');
      return data;
    },
  });

  // Fetch product by barcode
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

  // Create sale mutation
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
      setCart([]);
      setShowPayment(false);
      setPaymentMethod("");
      setPhoneNumber("");
    },
  });

  // STK Push mutation
  const stkPushMutation = useMutation({
    mutationFn: async ({ phone_number, amount, sale_id }) => {
      const response = await apiFetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number, amount, sale_id }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Payment failed");
      }
      return response.json();
    },
  });

  // Handle barcode scan/input
  const handleBarcodeSubmit = useCallback(async () => {
    if (!barcodeInput.trim()) return;

    const product = await fetchProductByBarcode(barcodeInput.trim());
    if (product) {
      addToCart(product);
      setBarcodeInput("");
    } else {
      alert("Product not found");
    }
  }, [barcodeInput, fetchProductByBarcode]);

  // Add product to cart
  const addToCart = useCallback((product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) => item.product_id === product.id,
      );
      if (existingItem) {
        if (existingItem.quantity >= product.stock_quantity) {
          alert(`Only ${product.stock_quantity} items available in stock`);
          return prevCart;
        }
        return prevCart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        if (product.stock_quantity === 0) {
          alert("Product is out of stock");
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
          },
        ];
      }
    });
  }, []);

  // Handle service click - show modal if adjustable/calculated
  const handleServiceClick = useCallback((service) => {
    if (service.price_type === 'adjustable' || service.price_type === 'calculated') {
      setSelectedService(service);
      setAdjustedPrice(service.price.toString());
      setPrintingPages(0);
    } else {
      // Fixed price - add directly to cart
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

  // Add service to cart directly (for fixed price or after modal confirmation)
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

  // Calculate price for printing services
  const calculatePrintingPrice = useCallback(() => {
    if (!selectedService) return 0;
    
    const priceConfig = selectedService.price_config || '';
    const pages = printingPages || 0;
    
    // Parse the price config for printing
    // Format: "Base price: $0.50 per page for black/white, $2.00 per page for color"
    let pricePerPage = 0.5; // Default
    if (printingType === 'color') {
      pricePerPage = 2.0;
    } else {
      pricePerPage = 0.5;
    }
    
    // Override with parsed values from price_config if available
    const bwMatch = priceConfig.match(/\$?(\d+\.?\d*).*black.*white/i);
    const colorMatch = priceConfig.match(/\$?(\d+\.?\d*).*color/i);
    
    if (printingType === 'color' && colorMatch) {
      pricePerPage = parseFloat(colorMatch[1]);
    } else if (printingType === 'bw' && bwMatch) {
      pricePerPage = parseFloat(bwMatch[1]);
    }
    
    return pages * pricePerPage;
  }, [selectedService, printingPages, printingType]);

  // Confirm adding service with adjusted price
  const confirmAddService = useCallback(() => {
    if (!selectedService) return;
    
    let finalPrice = parseFloat(adjustedPrice);
    
    if (selectedService.price_type === 'calculated') {
      finalPrice = calculatePrintingPrice();
    }
    
    if (isNaN(finalPrice) || finalPrice <= 0) {
      alert('Please enter a valid price');
      return;
    }
    
    addServiceToCartDirect(selectedService, finalPrice);
  }, [selectedService, adjustedPrice, calculatePrintingPrice, addServiceToCartDirect]);

  // Update cart item quantity
  const updateCartQuantity = useCallback((itemId, newQuantity, isService = false) => {
    if (newQuantity <= 0) {
      setCart((prevCart) =>
        prevCart.filter((item) => 
          isService ? item.service_id !== itemId : item.product_id !== itemId
        ),
      );
    } else {
      setCart((prevCart) =>
        prevCart.map((item) => {
          const isTargetItem = isService 
            ? item.service_id === itemId 
            : item.product_id === itemId;
          
          if (isTargetItem) {
            if (!isService && newQuantity > item.stock_available) {
              alert(`Only ${item.stock_available} items available in stock`);
              return item;
            }
            return { ...item, quantity: newQuantity };
          }
          return item;
        }),
      );
    }
  }, []);

  // Calculate total
  const total = cart.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );

  // Handle payment
  const handlePayment = useCallback(async () => {
    if (cart.length === 0) return;

    setIsProcessingPayment(true);

    try {
      if (paymentMethod === "mpesa") {
        if (!phoneNumber) {
          alert("Please enter phone number for M-Pesa payment");
          setIsProcessingPayment(false);
          return;
        }

        // Create sale first
        const sale = await createSaleMutation.mutateAsync({
          items: cart,
          payment_method: "mpesa",
        });

        // Then process STK push
        const paymentResult = await stkPushMutation.mutateAsync({
          phone_number: phoneNumber,
          amount: total,
          sale_id: sale.id,
        });

        if (paymentResult.success) {
          alert("Payment completed successfully!");
        } else {
          alert("Payment failed. Please try again.");
        }
      } else {
        // Cash or card payment
        await createSaleMutation.mutateAsync({
          items: cart,
          payment_method: paymentMethod,
        });
        alert("Sale completed successfully!");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setIsProcessingPayment(false);
    }
  }, [
    cart,
    paymentMethod,
    phoneNumber,
    total,
    createSaleMutation,
    stkPushMutation,
  ]);

  // Handle Enter key for barcode input
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200">
      {/* Header */}
      <div className="glass-card mb-6 mx-4 mt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-darkTeal-500 to-darkTeal-200 bg-clip-text text-transparent">
              Point of Sale System
            </h1>
            <a
              href="/admin"
              className="glass-button-primary p-3 hover-glow smooth-transition"
            >
              <Settings size={20} className="text-darkTeal-500" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products/Services Section */}
          <div className="lg:col-span-2">
            {/* Tab Switcher */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex space-x-4 mb-4">
                <button
                  onClick={() => setActiveTab("products")}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                    activeTab === "products"
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Package size={18} />
                  <span>Products</span>
                </button>
                <button
                  onClick={() => setActiveTab("services")}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                    activeTab === "services"
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Shield size={18} />
                  <span>Services</span>
                </button>
              </div>

              {activeTab === "products" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Search Products */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Barcode Input */}
                  <div className="relative">
                    <Scan className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <input
                      id="barcode-input"
                      type="text"
                      placeholder="Scan or enter barcode..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyPress={(e) =>
                        e.key === "Enter" && handleBarcodeSubmit()
                      }
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {activeTab === "services" && (
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search cyber services..."
                    value={serviceSearchTerm}
                    onChange={(e) => setServiceSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {/* Products Grid */}
            {activeTab === "products" && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Products
                </h2>
                {isLoading ? (
                  <div className="text-center py-8">Loading products...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map((product) => (
                      <div
                        key={product.id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => addToCart(product)}
                      >
                        <h3 className="font-medium text-gray-900 mb-1">
                          {product.name}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {product.category}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold text-green-600">
                            ${parseFloat(product.price).toFixed(2)}
                          </span>
                          <div className="flex items-center space-x-1">
                            {product.stock_quantity <=
                              product.min_stock_level && (
                              <AlertTriangle
                                size={16}
                                className="text-orange-500"
                              />
                            )}
                            <span
                              className={`text-sm ${
                                product.stock_quantity === 0
                                  ? "text-red-600"
                                  : product.stock_quantity <=
                                      product.min_stock_level
                                    ? "text-orange-600"
                                    : "text-gray-600"
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
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Cyber Services
                </h2>
                {isLoadingServices ? (
                  <div className="text-center py-8">Loading services...</div>
                ) : services.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No services found. Add services in the Admin panel.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {services.map((service) => (
                      <div
                        key={service.id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleServiceClick(service)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <Shield className="h-8 w-8 text-blue-500" />
                        </div>
                        <h3 className="font-medium text-gray-900 mb-1">
                          {service.name}
                        </h3>
                        <div className="flex items-center space-x-2 mb-2">
                          <p className="text-sm text-blue-600">
                            {service.category}
                          </p>
                          {service.price_type === 'adjustable' && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                              Negotiable
                            </span>
                          )}
                          {service.price_type === 'calculated' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              Calculated
                            </span>
                          )}
                        </div>
                        {service.description && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {service.description}
                          </p>
                        )}
                        {service.features && (
                          <p className="text-xs text-gray-500 mb-2">
                            {service.features.split(',').slice(0, 2).join(', ')}
                            {service.features.split(',').length > 2 && '...'}
                          </p>
                        )}
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-lg font-semibold text-green-600">
                            ${parseFloat(service.price).toFixed(2)}
                          </span>
                          {service.duration && (
                            <span className="text-sm text-gray-600">
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
          </div>

          {/* Cart Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Cart</h2>
                <ShoppingCart size={20} className="text-gray-600" />
              </div>

              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Cart is empty</p>
              ) : (
                <>
                  <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                    {cart.map((item) => {
                      const isService = item.is_service || item.service_id;
                      const itemId = isService ? item.service_id : item.product_id;
                      
                      return (
                        <div
                          key={itemId}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                        >
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              {isService ? (
                                <Shield size={14} className="text-blue-600" />
                              ) : (
                                <Package size={14} className="text-gray-600" />
                              )}
                              <h4 className="font-medium text-gray-900 text-sm">
                                {item.name}
                              </h4>
                            </div>
                            <p className="text-sm text-gray-600">
                              ${parseFloat(item.unit_price).toFixed(2)} each
                              {isService ? ' • Service' : ''}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                updateCartQuantity(
                                  itemId,
                                  item.quantity - 1,
                                  isService
                                )
                              }
                              className="p-1 text-gray-600 hover:text-gray-900"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="w-8 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateCartQuantity(
                                  itemId,
                                  item.quantity + 1,
                                  isService
                                )
                              }
                              className="p-1 text-gray-600 hover:text-gray-900"
                            >
                              <Plus size={16} />
                            </button>
                            <button
                              onClick={() =>
                                updateCartQuantity(itemId, 0, isService)
                              }
                              className="p-1 text-red-600 hover:text-red-700 ml-2"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total */}
                  <div className="border-t pt-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-medium text-gray-900">
                        Total:
                      </span>
                      <span className="text-2xl font-bold text-green-600">
                        ${total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Payment Section */}
                  {!showPayment ? (
                    <button
                      onClick={() => setShowPayment(true)}
                      className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
                    >
                      Proceed to Payment
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900">
                        Select Payment Method
                      </h3>

                      {/* Payment Methods */}
                      <div className="space-y-2">
                        <button
                          onClick={() => setPaymentMethod("cash")}
                          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-md border transition-colors ${
                            paymentMethod === "cash"
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          <Banknote size={20} />
                          <span>Cash</span>
                        </button>

                        <button
                          onClick={() => setPaymentMethod("card")}
                          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-md border transition-colors ${
                            paymentMethod === "card"
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          <CreditCard size={20} />
                          <span>Credit Card</span>
                        </button>

                        <button
                          onClick={() => setPaymentMethod("mpesa")}
                          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-md border transition-colors ${
                            paymentMethod === "mpesa"
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          <Smartphone size={20} />
                          <span>M-Pesa</span>
                        </button>
                      </div>

                      {/* M-Pesa Phone Number Input */}
                      {paymentMethod === "mpesa" && (
                        <input
                          type="tel"
                          placeholder="Enter phone number (254...)"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-700 cursor-pointer hover:border-gray-400 transition-colors"
                        />
                      )}

                      {/* Action Buttons */}
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setShowPayment(false);
                            setPaymentMethod("");
                            setPhoneNumber("");
                          }}
                          className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handlePayment}
                          disabled={!paymentMethod || isProcessingPayment}
                          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingPayment
                            ? "Processing..."
                            : "Complete Sale"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Price Adjustment Modal */}
      {selectedService && isMounted && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Configure {selectedService.name}
              </h3>
              <button
                onClick={() => {
                  setSelectedService(null);
                  setAdjustedPrice("");
                  setPrintingPages(0);
                }}
                className="text-gray-400 hover:text-gray-600"
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
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-700 cursor-pointer hover:border-gray-400 transition-colors"
                      placeholder="Enter number of pages"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Printing Type
                    </label>
                    <input
                      type="text"
                      list="printing-types"
                      value={printingType}
                      onChange={(e) => setPrintingType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Select printing type"
                    />
                    <datalist id="printing-types">
                      <option value="bw">Black & White</option>
                      <option value="color">Color</option>
                    </datalist>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Calculated Price:</span>
                      <span className="text-lg font-semibold text-green-600">
                        ${calculatePrintingPrice().toFixed(2)}
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
                    <div className="bg-gray-50 p-3 rounded-md">
                      <span className="text-lg font-semibold text-gray-900">
                        ${parseFloat(selectedService.price).toFixed(2)}
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
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-700 cursor-pointer hover:border-gray-400 transition-colors"
                      placeholder="Enter adjusted price"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Original price is ${parseFloat(selectedService.price).toFixed(2)}
                    </p>
                  </div>
                </>
              )}

              {selectedService.description && (
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">{selectedService.description}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 p-6 border-t">
              <button
                onClick={() => {
                  setSelectedService(null);
                  setAdjustedPrice("");
                  setPrintingPages(0);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddService}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Add to Cart</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RootPage() {
  const { authenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!authenticated || !user) {
        // Redirect to login if not authenticated
        navigate('/login', { replace: true });
      } else {
        // If authenticated, redirect based on role
        if (user.role === 'cashier') {
          navigate('/pos', { replace: true });
        } else {
          navigate('/admin', { replace: true });
        }
      }
    }
  }, [authenticated, loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-analytics-secondary">Loading...</div>
      </div>
    );
  }

  // Don't render anything while redirecting
  return null;
}
