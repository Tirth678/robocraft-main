import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  EyeOff,
  X,
  Save,
  Image as ImageIcon,
  IndianRupee,
  Package,
  Upload,
  Star,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import RequireAdmin from "@/components/RequireAdmin";
import {
  attachAsset,
  createProduct,
  deleteAsset,
  deleteProduct,
  fetchAdminProducts,
  updateProduct,
  uploadAssets,
  type InventoryProduct,
  type ProductKind,
  type ProductQuery,
} from "@/lib/inventoryApi";

type ProductFormData = {
  sku: string;
  name: string;
  description: string;
  price: number;
  category: string;
  kind: ProductKind;
  stock: number;
  imageUrl: string;
  isListed: boolean;
};

const emptyForm: ProductFormData = {
  sku: "",
  name: "",
  description: "",
  price: 0,
  category: "",
  kind: "physical",
  stock: 0,
  imageUrl: "",
  isListed: true,
};

const SORT_OPTIONS: { value: NonNullable<ProductQuery["sort"]>; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "priceAsc", label: "Price ↑" },
  { value: "priceDesc", label: "Price ↓" },
  { value: "stockAsc", label: "Stock ↑" },
];

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-all";

const AdminProductsContent = () => {
  const { token } = useAuth();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NonNullable<ProductQuery["sort"]>>("newest");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryProduct | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const page = await fetchAdminProducts(token, { search, sort, limit: 100 });
      setProducts(page.items);
      setTotal(page.total);
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to load products"));
    } finally {
      setLoading(false);
    }
  }, [search, sort, token]);

  useEffect(() => {
    const timer = setTimeout(loadProducts, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadProducts, search]);

  const handleOpenForm = (product?: InventoryProduct) => {
    if (product) {
      setEditing(product);
      setForm({
        sku: product.sku,
        name: product.name,
        description: product.description ?? "",
        price: product.price,
        category: product.category ?? "",
        kind: product.kind,
        stock: product.stock,
        imageUrl: product.imageUrl ?? "",
        isListed: product.isListed,
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!token) return;
    if (!form.sku.trim()) {
      toast.error("SKU is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (form.price <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price: form.price,
        category: form.category.trim() || undefined,
        kind: form.kind,
        imageUrl: form.imageUrl.trim() || undefined,
        isListed: form.isListed,
      };

      if (editing) {
        // Stock is intentionally not editable here: it only moves through the
        // Inventory screen so every change lands in the movement log.
        await updateProduct(token, editing.id, payload);
        toast.success("Product updated");
      } else {
        await createProduct(token, { ...payload, stock: form.stock });
        toast.success("Product created");
      }

      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to save product"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product: InventoryProduct) => {
    if (!token) return;
    if (!confirm(`Delete "${product.name}"? Ordered products are unlisted instead.`)) {
      return;
    }
    try {
      const result = await deleteProduct(token, product.id);
      toast.success(
        result.deleted
          ? `Deleted "${product.name}"`
          : `"${product.name}" has orders, so it was unlisted instead`
      );
      loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to delete product"));
    }
  };

  const handleToggleListed = async (product: InventoryProduct) => {
    if (!token) return;
    try {
      await updateProduct(token, product.id, { isListed: !product.isListed });
      toast.success(product.isListed ? "Hidden from store" : "Visible on store");
      loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to update product"));
    }
  };

  const handleUpload = async (product: InventoryProduct, files: FileList | null) => {
    if (!token || !files || files.length === 0) return;
    setUploadingFor(product.id);
    try {
      const assets = await uploadAssets(token, Array.from(files).slice(0, 5), {
        productId: product.id,
        folder: "robocraft/products",
      });
      if (!product.imageUrl && assets[0]) {
        await attachAsset(token, assets[0].publicId, {
          productId: product.id,
          primary: true,
        });
      }
      toast.success(`Uploaded ${assets.length} image(s)`);
      loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Upload failed"));
    } finally {
      setUploadingFor(null);
    }
  };

  const handleMakePrimary = async (product: InventoryProduct, publicId: string) => {
    if (!token) return;
    try {
      await attachAsset(token, publicId, { productId: product.id, primary: true });
      toast.success("Primary image updated");
      loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to set primary image"));
    }
  };

  const handleDeleteAsset = async (publicId: string) => {
    if (!token) return;
    if (!confirm("Delete this image from Cloudinary?")) return;
    try {
      await deleteAsset(token, publicId);
      toast.success("Image deleted");
      loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to delete image"));
    }
  };

  const listedCount = useMemo(
    () => products.filter((product) => product.isListed).length,
    [products]
  );

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight">PRODUCTS</h1>
            <p className="text-sm text-white/40 mt-1">
              {total} product(s) · {listedCount} visible on store
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadProducts}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all"
            >
              <RefreshCw size={14} />
              REFRESH
            </button>
            <button
              onClick={() => handleOpenForm()}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold hover:bg-purple-500 transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)]"
            >
              <Plus size={16} />
              New product
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, SKU or description"
              className={`${inputClass} pl-11`}
            />
          </div>
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as NonNullable<ProductQuery["sort"]>)
            }
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#0a0a0a]">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <Package className="mx-auto mb-4 text-white/20" size={40} />
            <p className="font-bold">No products yet</p>
            <p className="mt-1 text-sm text-white/40">
              Create your first product to populate the storefront.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="m-auto mt-5 text-white/20" size={20} />
                    )}
                  </div>

                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{product.name}</p>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                        {product.kind}
                      </span>
                      {!product.isListed && (
                        <span className="rounded-md bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-white/40">
                      {product.sku}
                      {product.category ? ` · ${product.category}` : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 font-bold">
                      <IndianRupee size={14} />
                      {product.price.toLocaleString("en-IN")}
                    </p>
                    <p
                      className={`text-xs font-bold ${
                        product.stock === 0
                          ? "text-red-400"
                          : product.stock <= 5
                            ? "text-yellow-400"
                            : "text-white/40"
                      }`}
                    >
                      {product.stock} in stock
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <label
                      className="cursor-pointer rounded-xl p-2.5 text-white/40 hover:bg-white/5 hover:text-white transition-all"
                      title="Upload images"
                    >
                      {uploadingFor === product.id ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Upload size={16} />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => handleUpload(product, event.target.files)}
                      />
                    </label>
                    <button
                      onClick={() => handleToggleListed(product)}
                      title={product.isListed ? "Hide from store" : "Show on store"}
                      className="rounded-xl p-2.5 text-white/40 hover:bg-white/5 hover:text-white transition-all"
                    >
                      {product.isListed ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      onClick={() => handleOpenForm(product)}
                      title="Edit"
                      className="rounded-xl p-2.5 text-white/40 hover:bg-white/5 hover:text-white transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(product)}
                      title="Delete"
                      className="rounded-xl p-2.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {product.assets && product.assets.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                    {product.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10"
                      >
                        <img
                          src={asset.secureUrl}
                          alt={asset.publicId}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/70 group-hover:flex">
                          <button
                            onClick={() => handleMakePrimary(product, asset.publicId)}
                            title="Set as primary"
                            className="text-yellow-400"
                          >
                            <Star size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(asset.publicId)}
                            title="Delete image"
                            className="text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a]"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
                <h2 className="font-black">
                  {editing ? "EDIT PRODUCT" : "NEW PRODUCT"}
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                      SKU *
                    </label>
                    <input
                      value={form.sku}
                      onChange={(event) => setForm({ ...form, sku: event.target.value })}
                      placeholder="RC-BOT-001"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                      Name *
                    </label>
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="RoboCraft Bot"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                      Price (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price || ""}
                      onChange={(event) =>
                        setForm({ ...form, price: parseFloat(event.target.value) || 0 })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                      Category
                    </label>
                    <input
                      value={form.category}
                      onChange={(event) =>
                        setForm({ ...form, category: event.target.value })
                      }
                      placeholder="Kits, Accessories"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                      Kind
                    </label>
                    <select
                      value={form.kind}
                      onChange={(event) =>
                        setForm({ ...form, kind: event.target.value as ProductKind })
                      }
                      className={inputClass}
                    >
                      <option value="physical" className="bg-[#0a0a0a]">
                        Physical
                      </option>
                      <option value="digital" className="bg-[#0a0a0a]">
                        Digital
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                      {editing ? "Stock (managed in Inventory)" : "Opening stock"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={Boolean(editing)}
                      value={form.stock || ""}
                      onChange={(event) =>
                        setForm({ ...form, stock: parseInt(event.target.value, 10) || 0 })
                      }
                      placeholder="0"
                      className={`${inputClass} disabled:opacity-40`}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                    Image URL
                  </label>
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(event) =>
                      setForm({ ...form, imageUrl: event.target.value })
                    }
                    placeholder="https://res.cloudinary.com/..."
                    className={inputClass}
                  />
                  <p className="mt-2 text-xs text-white/30">
                    Or upload images from the product row after saving.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                  <div>
                    <p className="text-sm font-bold">Visible on store</p>
                    <p className="mt-0.5 text-xs text-white/30">
                      {form.isListed
                        ? "Customers can see this product"
                        : "Hidden from the storefront"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isListed: !form.isListed })}
                  >
                    {form.isListed ? (
                      <ToggleRight size={36} className="text-green-400" />
                    ) : (
                      <ToggleLeft size={36} className="text-white/20" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/5 px-6 py-4">
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold text-white/40 hover:bg-white/5 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold hover:bg-purple-500 transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : editing ? "Update product" : "Create product"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

const AdminProductsPage = () => (
  <RequireAdmin>
    <AdminProductsContent />
  </RequireAdmin>
);

export default AdminProductsPage;
