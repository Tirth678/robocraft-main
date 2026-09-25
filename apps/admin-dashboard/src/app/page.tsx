'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/components/AuthProvider';
import {
  ShieldCheck,
  LogOut,
  Package,
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  Tag,
  CheckCircle2,
  XCircle,
  Box,
  Pencil,
  Trash2,
  ExternalLink,
  Eye,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import {
  fetchInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  adjustInventoryStock,
  deleteInventoryItem,
  fetchInventoryCoupons,
  createInventoryCoupon,
  type InventoryItem,
  type CouponItem,
} from '@/lib/inventoryService';

const PRESET_IMAGES = [
  { name: 'Bot Original', url: '/assets/product-robot.png' },
  { name: 'Happy Edition', url: '/assets/robot-happy.jpg' },
  { name: 'Fury Edition', url: '/assets/robot-angry.jpg' },
  { name: 'Emo Edition', url: '/assets/robot-sad.jpg' },
  { name: 'Time Keeper', url: '/assets/robot-clock.jpg' },
  { name: 'Custom Kit', url: '/assets/robot-custom.jpg' },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, token, isAuthenticated, isAdmin, isLoading, logout } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<'inventory' | 'coupons'>('inventory');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingData, setLoadingData] = useState(false);

  // New Item Form Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Robotics');
  const [newItemImageUrl, setNewItemImageUrl] = useState('/assets/product-robot.png');
  const [newItemMrp, setNewItemMrp] = useState('4999');
  const [newItemPrice, setNewItemPrice] = useState('3999');
  const [newItemQty, setNewItemQty] = useState('50');

  // Verification Step Modal State
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isPublishingItem, setIsPublishingItem] = useState(false);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editMrp, setEditMrp] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete Confirmation Modal State
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Stock Adjustment Modal State
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('Restock shipment');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // Coupon Modal State
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponKind, setCouponKind] = useState<'percentage' | 'fixed'>('percentage');
  const [couponValue, setCouponValue] = useState('15');
  const [isSubmittingCoupon, setIsSubmittingCoupon] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || !isAdmin) {
        router.push('/login');
      }
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      if (activeTab === 'inventory') {
        const data = await fetchInventoryItems(token, searchQuery);
        setItems(data || []);
      } else {
        const data = await fetchInventoryCoupons(token);
        setCoupons(data || []);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch data from inventory service:', err);
    } finally {
      setLoadingData(false);
    }
  }, [token, searchQuery, activeTab]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      void loadData();
    }
  }, [isAuthenticated, isAdmin, loadData]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Step 1: Open verification step before adding to official website
  const handleProceedToVerification = (e: React.FormEvent) => {
    e.preventDefault();
    const mrp = parseFloat(newItemMrp);
    const price = parseFloat(newItemPrice);

    if (isNaN(mrp) || isNaN(price)) {
      showNotification('error', 'Please enter valid numerical prices.');
      return;
    }
    if (price > mrp) {
      showNotification('error', 'Sale price cannot exceed the original MRP.');
      return;
    }
    if (!newItemSku.trim() || !newItemName.trim()) {
      showNotification('error', 'SKU and Item Name are required.');
      return;
    }

    setIsItemModalOpen(false);
    setIsVerifyModalOpen(true);
  };

  // Step 2: Admin verifies and publishes to official website
  const handleVerifyAndPublish = async () => {
    setIsPublishingItem(true);
    try {
      const mrpMinor = Math.round(parseFloat(newItemMrp) * 100);
      const salePriceMinor = Math.round(parseFloat(newItemPrice) * 100);
      const quantityOnHand = parseInt(newItemQty, 10) || 0;
      const imageUrl = newItemImageUrl.trim() || '/assets/product-robot.png';

      await createInventoryItem(token, {
        sku: newItemSku.trim().toUpperCase(),
        name: newItemName.trim(),
        description: newItemDesc.trim() || 'High precision robotic companion for RoboCraft Studio.',
        category: newItemCategory.trim() || 'Robotics',
        imageUrl,
        imageKeys: [imageUrl],
        mrpMinor,
        salePriceMinor,
        quantityOnHand,
      });

      showNotification('success', `✓ Verified! "${newItemName}" has been added and is now LIVE on the official website.`);
      setIsVerifyModalOpen(false);
      setNewItemSku('');
      setNewItemName('');
      setNewItemDesc('');
      setNewItemMrp('4999');
      setNewItemPrice('3999');
      setNewItemQty('50');
      void loadData();
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to publish item.');
    } finally {
      setIsPublishingItem(false);
    }
  };

  // Open Edit Modal with current item data
  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setEditSku(item.sku);
    setEditName(item.name);
    setEditDesc(item.description);
    setEditCategory(item.category || 'Robotics');
    const img = item.image_keys?.[0] || item.imageUrl || '/assets/product-robot.png';
    setEditImageUrl(img);
    setEditMrp((item.mrp_minor / 100).toString());
    setEditPrice((item.sale_price_minor / 100).toString());
    setEditQty(item.quantity_on_hand.toString());
  };

  // Save changes to current item
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSubmittingEdit(true);
    try {
      const mrpMinor = Math.round(parseFloat(editMrp) * 100);
      const salePriceMinor = Math.round(parseFloat(editPrice) * 100);
      const newQty = parseInt(editQty, 10);
      const imageUrl = editImageUrl.trim() || '/assets/product-robot.png';

      if (salePriceMinor > mrpMinor) {
        throw new Error('Sale price cannot exceed MRP.');
      }

      await updateInventoryItem(token, editingItem.id, {
        sku: editSku.trim().toUpperCase(),
        name: editName.trim(),
        description: editDesc.trim(),
        category: editCategory.trim(),
        imageUrl,
        imageKeys: [imageUrl],
        mrpMinor,
        salePriceMinor,
        quantityOnHand: isNaN(newQty) ? editingItem.quantity_on_hand : newQty,
      });

      showNotification('success', `✓ Item "${editName}" updated successfully on the official website!`);
      setEditingItem(null);
      void loadData();
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to update item.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Confirm delete/deactivate item
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsSubmittingDelete(true);
    try {
      await deleteInventoryItem(token, deletingItem.id);
      showNotification('success', `✓ Item "${deletingItem.name}" removed from official website.`);
      setDeletingItem(null);
      void loadData();
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to delete item.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;
    setIsSubmittingAdjust(true);
    try {
      const delta = parseInt(adjustQty, 10);
      if (isNaN(delta) || delta === 0) {
        throw new Error('Quantity delta must be non-zero integer');
      }

      await adjustInventoryStock(token, adjustingItem.id, {
        quantityDelta: delta,
        reason: adjustReason.trim() || 'Inventory reconciliation',
        idempotencyKey: crypto.randomUUID(),
      });

      showNotification('success', `Stock adjusted by ${delta > 0 ? '+' : ''}${delta} units for ${adjustingItem.name}`);
      setAdjustingItem(null);
      setAdjustQty('');
      void loadData();
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Stock adjustment failed.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCoupon(true);
    try {
      await createInventoryCoupon(token, {
        code: couponCode.trim().toUpperCase(),
        kind: couponKind,
        valueMinor: parseInt(couponValue, 10),
      });

      showNotification('success', `Coupon "${couponCode.toUpperCase()}" created!`);
      setIsCouponModalOpen(false);
      setCouponCode('');
      void loadData();
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to create coupon.');
    } finally {
      setIsSubmittingCoupon(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08080c] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const totalOnHand = items.reduce((sum, item) => sum + (item.quantity_on_hand || 0), 0);
  const lowStockCount = items.filter((item) => (item.quantity_on_hand || 0) <= 5).length;

  return (
    <div className="min-h-screen bg-[#08080c] text-slate-100 flex flex-col font-sans">
      {/* Top Admin Navbar */}
      <header className="border-b border-slate-800 bg-[#0e0e16]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight">RoboCraft Admin Control</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Storefront Synced
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Official Website Link */}
            <a
              href="http://localhost:8080/products"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="Open Official Website in new tab"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>View Official Website</span>
              <ExternalLink className="w-3 h-3 text-indigo-400 ml-0.5 opacity-70" />
            </a>

            <div className="text-right hidden sm:block border-l border-slate-800 pl-3">
              <p className="text-xs font-semibold text-slate-200">{user?.email}</p>
              <p className="text-[10px] text-emerald-400 font-mono uppercase">Role: {user?.role || 'Admin'}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 transition-colors flex items-center gap-2 text-xs font-medium"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 text-sm transition-all shadow-lg ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#12121a] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Live Website SKUs</span>
              <Package className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white">{items.length}</p>
            <span className="text-[11px] text-emerald-400">Published on Official Website</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#12121a] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Units on Hand</span>
              <Box className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white">{totalOnHand}</p>
            <span className="text-[11px] text-emerald-400">Available Inventory</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#12121a] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Low Stock Items</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">{lowStockCount}</p>
            <span className="text-[11px] text-slate-400">Threshold: &le; 5 units</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#12121a] border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Active Coupons</span>
              <Tag className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white">{coupons.length}</p>
            <span className="text-[11px] text-indigo-400">Promotions & Discounts</span>
          </div>
        </div>

        {/* Tab Controls & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'inventory'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-[#12121a] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              Website Products & Inventory
            </button>
            <button
              onClick={() => setActiveTab('coupons')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'coupons'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-[#12121a] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Tag className="w-4 h-4" />
              Coupons & Discounts
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="p-2.5 rounded-xl bg-[#12121a] border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>

            {activeTab === 'inventory' ? (
              <button
                onClick={() => setIsItemModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                Add New Item to Official Website
              </button>
            ) : (
              <button
                onClick={() => setIsCouponModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                Create Coupon
              </button>
            )}
          </div>
        </div>

        {/* Inventory View */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.currentTarget.value)}
                placeholder="Search products by SKU or name..."
                className="w-full bg-[#12121a] border border-slate-800 focus:border-indigo-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-colors"
              />
            </div>

            {/* Inventory Table */}
            <div className="bg-[#12121a] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#181824] border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                    <tr>
                      <th className="p-4">Item & Preview</th>
                      <th className="p-4">SKU</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Price / MRP</th>
                      <th className="p-4">Stock on Hand</th>
                      <th className="p-4">Website Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          {loadingData ? 'Loading website products...' : 'No inventory items found. Click "+ Add New Item" above to add one!'}
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const img = item.image_keys?.[0] || item.imageUrl || '/assets/product-robot.png';
                        return (
                          <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-700/50">
                                  <img
                                    src={img}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // Fallback to placeholder if broken image
                                      (e.currentTarget as HTMLImageElement).src = '/assets/product-robot.png';
                                    }}
                                  />
                                </div>
                                <div className="max-w-xs">
                                  <p className="font-semibold text-white truncate">{item.name}</p>
                                  <p className="text-[11px] text-slate-400 truncate">{item.description}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 font-mono font-bold text-indigo-400">{item.sku}</td>
                            <td className="p-4">
                              <span className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px]">
                                {item.category || 'Robotics'}
                              </span>
                            </td>
                            <td className="p-4 font-mono">
                              <span className="text-slate-400 line-through mr-2">
                                ₹{(item.mrp_minor / 100).toFixed(2)}
                              </span>
                              <span className="text-emerald-400 font-bold">
                                ₹{(item.sale_price_minor / 100).toFixed(2)}
                              </span>
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold inline-flex items-center gap-1.5 ${
                                  item.quantity_on_hand <= 5
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                {item.quantity_on_hand} units
                              </span>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                LIVE ON WEB
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Update / Edit Button */}
                                <button
                                  onClick={() => handleOpenEdit(item)}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 transition-colors font-medium text-[11px] flex items-center gap-1"
                                  title="Edit & Update Product Information"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Edit
                                </button>

                                {/* Adjust Stock Button */}
                                <button
                                  onClick={() => {
                                    setAdjustingItem(item);
                                    setAdjustQty('10');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors font-medium text-[11px]"
                                  title="Adjust Stock Quantity"
                                >
                                  Stock
                                </button>

                                {/* Delete / Remove Button */}
                                <button
                                  onClick={() => setDeletingItem(item)}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-300 border border-red-500/20 transition-colors font-medium text-[11px] flex items-center gap-1"
                                  title="Remove Item from Official Website"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Coupons View */}
        {activeTab === 'coupons' && (
          <div className="bg-[#12121a] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#181824] border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                  <tr>
                    <th className="p-4">Coupon Code</th>
                    <th className="p-4">Discount Type</th>
                    <th className="p-4">Value</th>
                    <th className="p-4">Min. Order</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        {loadingData ? 'Loading coupon promotions...' : 'No active coupons found.'}
                      </td>
                    </tr>
                  ) : (
                    coupons.map((coupon) => (
                      <tr key={coupon.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-mono font-bold text-indigo-400">{coupon.code}</td>
                        <td className="p-4 capitalize">{coupon.kind}</td>
                        <td className="p-4 font-mono font-bold text-emerald-400">
                          {coupon.kind === 'percentage'
                            ? `${coupon.value_minor}% OFF`
                            : `₹${(coupon.value_minor / 100).toFixed(2)} OFF`}
                        </td>
                        <td className="p-4 font-mono text-slate-300">
                          ₹{(coupon.minimum_order_minor / 100).toFixed(2)}
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 1. ADD ITEM MODAL - Step 1: Configure Details                            */}
      {/* ========================================================================= */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-400" />
              Add New Product to Storefront
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Enter product details below. You will be prompted to verify the configuration before publishing to the official website.
            </p>

            <form onSubmit={handleProceedToVerification} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">SKU</label>
                  <input
                    type="text"
                    required
                    value={newItemSku}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemSku(e.currentTarget.value)}
                    placeholder="ROBO-VIPER-07"
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    required
                    value={newItemCategory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemCategory(e.currentTarget.value)}
                    placeholder="Robotics"
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemName(e.currentTarget.value)}
                  placeholder="RoboCraft Viper Companion"
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Description</label>
                <textarea
                  value={newItemDesc}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewItemDesc(e.currentTarget.value)}
                  placeholder="Interactive robotic desk sidekick with OLED expressions and reactive sensors."
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none h-20 resize-none"
                />
              </div>

              {/* Image URL & Preset Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Product Image URL</label>
                <input
                  type="text"
                  value={newItemImageUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemImageUrl(e.currentTarget.value)}
                  placeholder="/assets/product-robot.png or https://..."
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                />
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] text-slate-400">Quick presets:</span>
                  {PRESET_IMAGES.map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      onClick={() => setNewItemImageUrl(preset.url)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors ${
                        newItemImageUrl === preset.url
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newItemMrp}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemMrp(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Sale Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newItemPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemPrice(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Initial Qty</label>
                  <input
                    type="number"
                    required
                    value={newItemQty}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemQty(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
                >
                  <span>Review & Verify Item</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VERIFICATION MODAL - Ask admin to verify & add to official website     */}
      {/* ========================================================================= */}
      {isVerifyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-indigo-500/40 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Verify Item Details</h2>
                <p className="text-xs text-slate-400">Confirm and publish to the official website storefront</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-indigo-200 mb-4 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                Please verify the information below. Once verified, this item will immediately be listed and visible to all customers on the official RoboCraft website.
              </span>
            </div>

            {/* Live Storefront Card Preview */}
            <div className="p-4 rounded-2xl bg-[#161622] border border-slate-700/60 mb-5 space-y-3">
              <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                Storefront Preview
              </div>

              <div className="flex gap-4 items-center">
                <div className="w-20 h-20 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-700/60 shadow-md">
                  <img
                    src={newItemImageUrl || '/assets/product-robot.png'}
                    alt={newItemName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/assets/product-robot.png';
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-600/20 text-indigo-300 font-mono text-[10px] border border-indigo-500/30">
                      {newItemSku}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px]">
                      {newItemCategory}
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-sm truncate">{newItemName}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{newItemDesc || 'Robotic desk companion'}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 line-through mr-2">
                    ₹{parseFloat(newItemMrp || '0').toFixed(2)}
                  </span>
                  <span className="text-base font-bold text-emerald-400">
                    ₹{parseFloat(newItemPrice || '0').toFixed(2)}
                  </span>
                  {parseFloat(newItemMrp) > parseFloat(newItemPrice) && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {Math.round((1 - parseFloat(newItemPrice) / parseFloat(newItemMrp)) * 100)}% OFF
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-300 font-mono font-medium">
                    {newItemQty} units in stock
                  </span>
                </div>
              </div>
            </div>

            {/* Verification Checklist */}
            <div className="space-y-2 mb-6 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>SKU and product details verified</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Pricing: Sale Price ₹{newItemPrice} (MRP ₹{newItemMrp})</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Target: Official RoboCraft Storefront (/products & /kits)</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsVerifyModalOpen(false);
                  setIsItemModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Edit</span>
              </button>

              <button
                type="button"
                onClick={handleVerifyAndPublish}
                disabled={isPublishingItem}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
              >
                {isPublishingItem ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing to Website...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Add to Official Website</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EDIT / UPDATE ITEM MODAL - Admin can update current information         */}
      {/* ========================================================================= */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-400" />
              Edit Product Information
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Updating this item will immediately update its details on the official website.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">SKU</label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditSku(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    required
                    value={editCategory}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditCategory(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.currentTarget.value)}
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDesc(e.currentTarget.value)}
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none h-20 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Product Image URL</label>
                <input
                  type="text"
                  value={editImageUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditImageUrl(e.currentTarget.value)}
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                />
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] text-slate-400">Quick presets:</span>
                  {PRESET_IMAGES.map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      onClick={() => setEditImageUrl(preset.url)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors ${
                        editImageUrl === preset.url
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editMrp}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditMrp(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Sale Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPrice(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Stock on Hand</label>
                  <input
                    type="number"
                    required
                    value={editQty}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditQty(e.currentTarget.value)}
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save & Update Official Website'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DELETE CONFIRMATION MODAL - Admin can delete/deactivate items           */}
      {/* ========================================================================= */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <div className="p-2.5 rounded-xl bg-red-600/10 border border-red-500/20">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Remove from Official Website?</h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Are you sure you want to remove <span className="font-bold text-white font-mono">{deletingItem.name}</span> (SKU: <span className="font-mono text-indigo-400">{deletingItem.sku}</span>)?
              This will immediately remove the product from customer storefront listings.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmittingDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-lg shadow-red-600/20"
              >
                {isSubmittingDelete ? 'Removing...' : 'Yes, Remove from Website'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. STOCK ADJUSTMENT MODAL                                                 */}
      {/* ========================================================================= */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Adjust Stock</h2>
            <p className="text-xs text-slate-400 mb-4">
              Item: <span className="text-indigo-400 font-mono font-bold">{adjustingItem.sku}</span> - {adjustingItem.name}
            </p>

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                  Quantity Delta (e.g. +10 or -5)
                </label>
                <input
                  type="number"
                  required
                  value={adjustQty}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustQty(e.currentTarget.value)}
                  placeholder="10"
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2.5 rounded-xl text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Reason</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustReason(e.currentTarget.value)}
                  placeholder="Restock / Audit adjustment"
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2.5 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmittingAdjust ? 'Updating...' : 'Confirm Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. COUPON CREATION MODAL                                                  */}
      {/* ========================================================================= */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Create Promotion Coupon</h2>

            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  value={couponCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCouponCode(e.currentTarget.value)}
                  placeholder="SUMMER2026"
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Kind</label>
                  <select
                    value={couponKind}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setCouponKind(e.currentTarget.value as 'percentage' | 'fixed')
                    }
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Value</label>
                  <input
                    type="number"
                    required
                    value={couponValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCouponValue(e.currentTarget.value)}
                    placeholder="15"
                    className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white px-3 py-2 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCouponModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCoupon}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmittingCoupon ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
