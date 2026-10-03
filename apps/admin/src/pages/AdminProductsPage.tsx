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
  KeyRound,
  FileDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AdminAuthContext";
import AdminLayout from "@/components/AdminLayout";
import RequireAdmin from "@/components/RequireAdmin";
import {
  attachAsset,
  createProduct,
  deleteAsset,
  deleteDigitalAsset,
  deleteProduct,
  fetchAdminProducts,
  fetchDigitalAssets,
  fetchLicenseKeys,
  importLicenseKeys,
  resolveMediaUrl,
  updateProduct,
  uploadAssets,
  uploadDigitalAssets,
  type DeliveryMode,
  type DigitalAsset,
  type DigitalLicenseKey,
  type InventoryProduct,
  type ProductKind,
  type ProductQuery,
} from "@/lib/adminApi";

type ProductFormData = {
  sku: string;
  name: string;
  description: string;
  price: number;
  category: string;
  kind: ProductKind;
  deliveryMode: DeliveryMode;
  downloadLimit: number;
  digitalInstructions: string;
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
  deliveryMode: "files",
  downloadLimit: 0,
  digitalInstructions: "",
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

  // Digital deliverables / license keys panel
  const [digitalFor, setDigitalFor] = useState<string | null>(null);
  const [digitalAssets, setDigitalAssets] = useState<DigitalAsset[]>([]);
  const [digitalKeys, setDigitalKeys] = useState<DigitalLicenseKey[]>([]);
  const [keyText, setKeyText] = useState("");
  const [digitalBusy, setDigitalBusy] = useState<string | null>(null);

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
        deliveryMode: product.deliveryMode ?? "files",
        downloadLimit: product.downloadLimit ?? 0,
        digitalInstructions: product.digitalInstructions ?? "",
        stock: product.stock ?? 0,
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
        // Digital fields only apply to digital goods; `downloadLimit` 0 means
        // "no limit" and is sent as null (an empty instruction clears the field).
        ...(form.kind === "digital"
          ? {
              deliveryMode: form.deliveryMode,
              downloadLimit: form.downloadLimit > 0 ? form.downloadLimit : null,
              digitalInstructions: form.digitalInstructions.trim(),
            }
          : {}),
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

  const loadDigitalDetails = useCallback(
    async (product: InventoryProduct) => {
      if (!token) return;
      try {
        const [assets, keys] = await Promise.all([
          fetchDigitalAssets(token, product.id),
          fetchLicenseKeys(token, product.id),
        ]);
        setDigitalAssets(assets);
        setDigitalKeys(keys);
      } catch (error) {
        setDigitalAssets([]);
        setDigitalKeys([]);
        toast.error(getSafeErrorMessage(error, "Failed to load digital details"));
      }
    },
    [token]
  );

  const toggleDigitalManager = (product: InventoryProduct) => {
    const next = digitalFor === product.id ? null : product.id;
    setDigitalFor(next);
    setKeyText("");
    if (next) void loadDigitalDetails(product);
  };

  const handleUploadDeliverables = async (product: InventoryProduct, files: FileList | null) => {
    if (!token || !files || files.length === 0) return;
    setDigitalBusy(product.id);
    try {
      const uploaded = await uploadDigitalAssets(token, product.id, Array.from(files).slice(0, 5));
      toast.success(`Uploaded ${uploaded.length} deliverable(s)`);
      await loadDigitalDetails(product);
      void loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Deliverable upload failed"));
    } finally {
      setDigitalBusy(null);
    }
  };

  const handleDeleteDeliverable = async (assetId: string) => {
    if (!token) return;
    if (!confirm("Remove this deliverable? Downloads already sold keep working.")) return;
    try {
      await deleteDigitalAsset(token, assetId);
      toast.success("Deliverable removed");
      const product = products.find((item) => item.id === digitalFor);
      if (product) await loadDigitalDetails(product);
      void loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to remove deliverable"));
    }
  };

  const handleImportKeys = async (product: InventoryProduct) => {
    if (!token || !keyText.trim()) return;
    setDigitalBusy(product.id);
    try {
      const result = await importLicenseKeys(token, product.id, keyText);
      toast.success(`Added ${result.added} key(s) · ${result.duplicates} duplicate(s) skipped`);
      setKeyText("");
      await loadDigitalDetails(product);
      void loadProducts();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to import keys"));
    } finally {
      setDigitalBusy(null);
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
    if (!confirm("Delete this image from storage?")) return;
    try {
      await deleteAsset(token, publicId, { purge: true });
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
                        src={resolveMediaUrl(product.imageUrl)}
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
                        product.stock === null
                          ? "text-emerald-400"
                          : product.stock === 0
                            ? "text-red-400"
                            : product.stock <= 5
                              ? "text-yellow-400"
                              : "text-white/40"
                      }`}
                    >
                      {product.kind === "digital"
                        ? product.stock === null
                          ? "instant download"
                          : `${product.stock} key${product.stock === 1 ? "" : "s"} left`
                        : `${product.stock ?? 0} in stock`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {product.kind === "digital" && (
                      <button
                        onClick={() => toggleDigitalManager(product)}
                        title="Manage deliverables and license keys"
                        className={`rounded-xl p-2.5 transition-all ${
                          digitalFor === product.id
                            ? "bg-white/10 text-white"
                            : "text-white/40 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <KeyRound size={16} />
                      </button>
                    )}
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

                {digitalFor === product.id && (
                  <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-widest text-white/40">
                        Digital deliverables
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                        {(product.deliveryMode ?? "files").replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/60 hover:bg-white/5 hover:text-white transition-all">
                        {digitalBusy === product.id ? "Uploading…" : "Upload files"}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(event) => handleUploadDeliverables(product, event.target.files)}
                        />
                      </label>
                      <span className="text-xs text-white/40">
                        {digitalAssets.length} file(s) ·{" "}
                        {digitalKeys.filter((key) => key.status === "available").length} key(s)
                        available
                      </span>
                    </div>

                    {digitalAssets.length > 0 && (
                      <ul className="space-y-2">
                        {digitalAssets.map((asset) => (
                          <li
                            key={asset.id}
                            className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
                          >
                            <FileDown size={14} className="shrink-0 text-white/40" />
                            <span className="flex-1 truncate text-xs">{asset.fileName}</span>
                            <span className="text-[10px] text-white/30">
                              {(asset.bytes / 1024).toFixed(0)} KB
                            </span>
                            <button
                              onClick={() => handleDeleteDeliverable(asset.id)}
                              title="Remove deliverable"
                              className="text-red-400/60 hover:text-red-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                        License keys (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={keyText}
                        onChange={(event) => setKeyText(event.target.value)}
                        placeholder={"ROBO-XXXX-YYYY\nROBO-ZZZZ-WWWW"}
                        className={inputClass}
                      />
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => handleImportKeys(product)}
                          disabled={!keyText.trim() || digitalBusy === product.id}
                          className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition-all hover:bg-white/80 disabled:opacity-40"
                        >
                          Import keys
                        </button>
                        <span className="text-xs text-white/40">
                          {digitalKeys.filter((key) => key.status === "available").length} available ·{" "}
                          {digitalKeys.filter((key) => key.status === "assigned").length} assigned
                        </span>
                      </div>
                    </div>
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
                      {form.kind === "digital"
                        ? "Stock (from license keys)"
                        : editing
                          ? "Stock (managed in Inventory)"
                          : "Opening stock"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={Boolean(editing) || form.kind === "digital"}
                      value={form.stock || ""}
                      onChange={(event) =>
                        setForm({ ...form, stock: parseInt(event.target.value, 10) || 0 })
                      }
                      placeholder={form.kind === "digital" ? "Managed below" : "0"}
                      className={`${inputClass} disabled:opacity-40`}
                    />
                  </div>
                </div>

                {form.kind === "digital" && (
                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-white/40">
                      Digital delivery
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                          Delivered as
                        </label>
                        <select
                          value={form.deliveryMode}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              deliveryMode: event.target.value as DeliveryMode,
                            })
                          }
                          className={inputClass}
                        >
                          <option value="files" className="bg-[#0a0a0a]">
                            Files only
                          </option>
                          <option value="license_keys" className="bg-[#0a0a0a]">
                            License keys only
                          </option>
                          <option value="both" className="bg-[#0a0a0a]">
                            Files + license keys
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                          Download limit (0 = unlimited)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={form.downloadLimit || ""}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              downloadLimit: parseInt(event.target.value, 10) || 0,
                            })
                          }
                          placeholder="Unlimited"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-widest text-white/40">
                        Download instructions (shown on the claim page)
                      </label>
                      <textarea
                        rows={3}
                        value={form.digitalInstructions}
                        onChange={(event) =>
                          setForm({ ...form, digitalInstructions: event.target.value })
                        }
                        placeholder="Unzip firmware-v2.zip, then connect the robot…"
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}

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
