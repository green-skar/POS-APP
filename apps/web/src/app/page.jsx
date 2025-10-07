"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

export default function POSSystem() {
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const queryClient = useQueryClient();

  // Fetch products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      return response.json();
    },
  });

  // Fetch product by barcode
  const fetchProductByBarcode = useCallback(async (barcode) => {
    try {
      const response = await fetch(`/api/products/barcode/${barcode}`);
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
      const response = await fetch("/api/sales", {
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
      const response = await fetch("/api/mpesa/stk-push", {
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

  // Update cart item quantity
  const updateCartQuantity = useCallback((productId, newQuantity) => {
    if (newQuantity <= 0) {
      setCart((prevCart) =>
        prevCart.filter((item) => item.product_id !== productId),
      );
    } else {
      setCart((prevCart) =>
        prevCart.map((item) => {
          if (item.product_id === productId) {
            if (newQuantity > item.stock_available) {
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">POS System</h1>
            <div className="flex items-center space-x-4">
              <a
                href="/admin"
                className="p-2 text-gray-600 hover:text-gray-900"
              >
                <Settings size={20} />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products Section */}
          <div className="lg:col-span-2">
            {/* Search and Barcode Input */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
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
            </div>

            {/* Products Grid */}
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
                    {cart.map((item) => (
                      <div
                        key={item.product_id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 text-sm">
                            {item.name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            ${parseFloat(item.unit_price).toFixed(2)} each
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.product_id,
                                item.quantity - 1,
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
                                item.product_id,
                                item.quantity + 1,
                              )
                            }
                            className="p-1 text-gray-600 hover:text-gray-900"
                          >
                            <Plus size={16} />
                          </button>
                          <button
                            onClick={() =>
                              updateCartQuantity(item.product_id, 0)
                            }
                            className="p-1 text-red-600 hover:text-red-700 ml-2"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
    </div>
  );
}
