"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Barcode, Camera, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import type { QuantityUnit, StorageArea } from "@/types/domain";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "found";
      label: string;
      brand?: string;
      category?: string;
      imageUrl?: string;
      quantityText?: string;
      quantityValue?: number;
      quantityUnit?: QuantityUnit;
      storageArea?: StorageArea;
    }
  | { status: "not-found" }
  | { status: "error"; message: string };

type AddProductDialogProps = {
  open: boolean;
  initialMode?: "manual" | "scan";
  onClose: () => void;
  onPersisted?: () => void;
};

const unitOptions: { label: string; value: QuantityUnit }[] = [
  { label: "Grammes", value: "g" },
  { label: "Millilitres", value: "ml" },
  { label: "Pièces", value: "pieces" },
  { label: "Portions", value: "portions" },
  { label: "Pots", value: "pots" },
  { label: "Paquets", value: "paquets" },
  { label: "Bouteilles", value: "bouteilles" }
];

const storageOptions: { label: string; value: StorageArea }[] = [
  { label: "Frais", value: "fresh" },
  { label: "Surgelés", value: "frozen" },
  { label: "Sec", value: "dry" },
  { label: "Autre", value: "other" }
];
const MAX_VIDEO_INIT_ATTEMPTS = 20;
const VIDEO_INIT_RETRY_DELAY_MS = 50;
const fieldClass = "block space-y-1.5 text-sm font-medium";
const controlClass = "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-base outline-none focus:border-brand-500 sm:h-11 sm:text-sm";

export function AddProductDialog({ initialMode = "manual", open, onClose, onPersisted }: AddProductDialogProps) {
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<QuantityUnit>("pieces");
  const [storageArea, setStorageArea] = useState<StorageArea>("fresh");
  const [expirationDate, setExpirationDate] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const initialModeStartedRef = useRef(false);
  const startCameraScanRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    startCameraScanRef.current = startCameraScan;
  });

  useEffect(() => {
    if (!open) {
      initialModeStartedRef.current = false;
      return;
    }

    const wasAlreadyLocked = document.body.classList.contains("eco-dialog-open");
    document.body.classList.add("eco-dialog-open");

    return () => {
      if (!wasAlreadyLocked) {
        document.body.classList.remove("eco-dialog-open");
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || initialMode !== "scan" || initialModeStartedRef.current) {
      return;
    }

    initialModeStartedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void startCameraScanRef.current?.();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [initialMode, open]);

  if (!open) {
    return null;
  }

  async function lookupProduct(barcodeValue?: string) {
    const cleanBarcode = (barcodeValue ?? barcode).trim();

    if (!cleanBarcode) {
      setLookup({ status: "error", message: "Renseigne d'abord un code-barres." });
      return;
    }

    try {
      setLookup({ status: "loading" });

      const response = await fetch(`/api/products/lookup/${encodeURIComponent(cleanBarcode)}`, {
        cache: "no-store"
      });

      if (response.status === 404) {
        setLookup({ status: "not-found" });
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        product: {
          name: string;
          brand?: string;
          category?: string;
          imageUrl?: string;
          quantityText?: string;
          quantityValue?: number;
          quantityUnit?: QuantityUnit;
          storageArea?: StorageArea;
        };
      };

      setBarcode(cleanBarcode);
      setName(payload.product.name);
      if (payload.product.quantityValue && payload.product.quantityValue > 0) {
        setQuantity(String(payload.product.quantityValue));
      }
      if (payload.product.quantityUnit) {
        setUnit(payload.product.quantityUnit);
      }
      setStorageArea(payload.product.storageArea ?? "other");
      setLookup({
        status: "found",
        label: payload.product.name,
        brand: payload.product.brand,
        category: payload.product.category,
        imageUrl: payload.product.imageUrl,
        quantityText: payload.product.quantityText,
        quantityValue: payload.product.quantityValue,
        quantityUnit: payload.product.quantityUnit,
        storageArea: payload.product.storageArea ?? "other"
      });
    } catch {
      setLookup({ status: "error", message: "Impossible de joindre Open Food Facts." });
    }
  }

  async function startCameraScan() {
    setScanError(null);
    setValidationMessage(null);

    if (typeof window === "undefined") {
      return;
    }

    if (!window.isSecureContext) {
      setScanError("La caméra nécessite une URL sécurisée. Utilise localhost ou une adresse HTTPS.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("La caméra n'est pas accessible sur cet appareil.");
      return;
    }

    const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (target: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    stopCamera();
    setIsScanning(true);
    let videoElement: HTMLVideoElement | null = null;
    for (let attempt = 0; attempt < MAX_VIDEO_INIT_ATTEMPTS; attempt += 1) {
      if (videoRef.current) {
        videoElement = videoRef.current;
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, VIDEO_INIT_RETRY_DELAY_MS));
    }

    if (!videoElement) {
      setScanError("Impossible d'initialiser l'aperçu caméra.");
      stopCamera();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }
      });
      streamRef.current = stream;
      videoElement.srcObject = stream;
      await videoElement.play();

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const tick = async () => {
          if (!videoRef.current || !streamRef.current) {
            return;
          }

          try {
            const barcodes = await detector.detect(videoRef.current);
            const detectedCode = barcodes.find((entry) => Boolean(entry.rawValue))?.rawValue?.trim();

            if (detectedCode) {
              stopCamera();
              setBarcode(detectedCode);
              await lookupProduct(detectedCode);
              return;
            }
          } catch {
            // keep scanning
          }

          frameRef.current = window.requestAnimationFrame(() => {
            void tick();
          });
        };

        frameRef.current = window.requestAnimationFrame(() => {
          void tick();
        });
        return;
      }

      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      zxingControlsRef.current = await reader.decodeFromVideoElement(videoElement, (result) => {
        const detectedCode = result?.getText()?.trim();
        if (!detectedCode) {
          return;
        }
        stopCamera();
        setBarcode(detectedCode);
        void lookupProduct(detectedCode);
      });
    } catch (error) {
      stopCamera();
      setScanError(getCameraAccessErrorMessage(error));
    }
  }

  function stopCamera() {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (zxingControlsRef.current) {
      zxingControlsRef.current.stop();
      zxingControlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  }

  function resetForm() {
    setBarcode("");
    setName("");
    setQuantity("1");
    setUnit("pieces");
    setStorageArea("fresh");
    setExpirationDate("");
    setLookup({ status: "idle" });
    setSubmitError(null);
    setValidationMessage(null);
    setScanError(null);
  }

  function closeDialog() {
    if (isSubmitting) {
      return;
    }

    stopCamera();
    onClose();
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setValidationMessage(null);

    const trimmedName = name.trim();
    const numericQuantity = Number(quantity.replace(",", "."));
    const cleanBarcode = barcode.trim();
    const productImageUrl = lookup.status === "found" ? toPersistableImageUrl(lookup.imageUrl) : undefined;

    if (!trimmedName) {
      setValidationMessage("Le nom du produit est obligatoire.");
      return;
    }

    if (cleanBarcode && !/^\d{6,18}$/.test(cleanBarcode)) {
      setValidationMessage("Le code-barres doit contenir entre 6 et 18 chiffres.");
      return;
    }

    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setValidationMessage("La quantité doit être supérieure à 0.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/inventory/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getBrowserAuthHeaders()) },
        body: JSON.stringify({
          product: {
            name: trimmedName,
            barcode: cleanBarcode || undefined,
            brand: lookup.status === "found" ? lookup.brand : undefined,
            category: lookup.status === "found" ? lookup.category : undefined,
            imageUrl: productImageUrl,
            source: cleanBarcode ? "open_food_facts" : "manual",
            default_storage_area: storageArea,
            default_unit: unit
          },
          quantity: numericQuantity,
          unit,
          storageArea,
          expirationDate: expirationDate || null
        })
      });

      if (!response.ok) {
        throw new Error(await getInventoryBatchErrorMessage(response));
      }

      await response.json();
      onPersisted?.();
      resetForm();
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Impossible d'ajouter le produit.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:p-4">
      <form
        onSubmit={(event) => void submitForm(event)}
        className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-soft sm:max-h-[calc(100dvh-2rem)]"
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold sm:text-xl">Ajouter un produit</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">Scanne un code-barres ou saisis le produit manuellement.</p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Fermer"
              disabled={isSubmitting}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
          <div className="space-y-3 sm:space-y-4">
            <label className={fieldClass}>
              <span>Code-barres</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={`${controlClass} col-span-2`}
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  inputMode="numeric"
                  placeholder="Ex : 7376280645028"
                />
                <Button type="button" variant="secondary" className="h-10 gap-2 px-3" onClick={() => void lookupProduct()} disabled={isSubmitting}>
                  <Search className="h-4 w-4" />
                  Chercher
                </Button>
                <Button type="button" variant="secondary" className="h-10 gap-2 px-3" onClick={() => void startCameraScan()} disabled={isSubmitting || isScanning}>
                  <Camera className="h-4 w-4" />
                  Scanner
                </Button>
              </div>
            </label>

          {isScanning ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <video ref={videoRef} className="h-40 w-full rounded-lg bg-black object-cover sm:h-52" muted playsInline />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-slate-600">Recherche du code-barres...</p>
                <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={stopCamera}>
                  Arrêter
                </Button>
              </div>
            </div>
          ) : null}

          {scanError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {scanError}
            </div>
          ) : null}

          {lookup.status === "loading" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              Recherche du produit sur Open Food Facts...
            </div>
          ) : null}

          {lookup.status === "found" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="mb-2 flex items-start gap-3 font-semibold">
                <ProductThumbnail name={lookup.label} imageUrl={lookup.imageUrl} fallbackLabel={lookup.label} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-200 bg-white text-xs font-bold text-emerald-700" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Barcode className="h-4 w-4" />
                    <span>Produit trouvé</span>
                  </div>
                  <p className="truncate font-semibold text-emerald-900">{lookup.label}</p>
                </div>
              </div>
              {lookup.brand ? <p className="text-emerald-700">Marque: {lookup.brand}</p> : null}
              {lookup.category ? <p className="text-emerald-700">Catégorie: {lookup.category}</p> : null}
              {lookup.quantityText ? <p className="text-emerald-700">Quantité: {lookup.quantityText}</p> : null}
              {lookup.quantityValue && lookup.quantityUnit ? (
                <p className="text-emerald-700">
                  Préremplissage: {lookup.quantityValue} {lookup.quantityUnit === "g" ? "grammes" : lookup.quantityUnit === "ml" ? "millilitres" : "pièces"}
                </p>
              ) : null}
              {lookup.storageArea ? (
                <p className="text-emerald-700">
                  Zone suggérée: {lookup.storageArea === "fresh" ? "Frais" : lookup.storageArea === "frozen" ? "Surgelés" : lookup.storageArea === "dry" ? "Sec" : "Autre"}
                </p>
              ) : null}
            </div>
          ) : null}

          {lookup.status === "not-found" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Aucun code détecté dans le catalogue. Continue en saisie manuelle.
            </div>
          ) : null}

          {lookup.status === "error" ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {lookup.message}
            </div>
          ) : null}

          <label className={fieldClass}>
            <span>Nom du produit</span>
            <input
              className={controlClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex : Riz basmati"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={fieldClass}>
              <span>Quantité</span>
              <input
                className={controlClass}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
              />
            </label>

            <label className={fieldClass}>
              <span>Unité</span>
              <select
                className={controlClass}
                value={unit}
                onChange={(event) => setUnit(event.target.value as QuantityUnit)}
              >
                {unitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={fieldClass}>
              <span>Zone</span>
              <select
                className={controlClass}
                value={storageArea}
                onChange={(event) => setStorageArea(event.target.value as StorageArea)}
              >
                {storageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={fieldClass}>
              <span>DLC facultative</span>
              <input
                className={controlClass}
                value={expirationDate}
                onChange={(event) => setExpirationDate(event.target.value)}
                type="date"
              />
            </label>
          </div>
        </div>

        {validationMessage ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{validationMessage}</p>
        ) : null}

        {submitError ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</p>
        ) : null}

        {isSubmitting ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Ajout en cours...</p>
        ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-[0.85fr_1.15fr] gap-2 border-t border-slate-100 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:grid-cols-2 sm:px-5 sm:pb-4">
          <Button variant="secondary" className="h-10" onClick={closeDialog} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button type="submit" className="h-10" disabled={isSubmitting}>
            {isSubmitting ? "Ajout..." : "Ajouter au stock"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function getCameraAccessErrorMessage(error: unknown) {
  if (!(error instanceof DOMException)) {
    return "Impossible d'accéder à la caméra. Vérifie les permissions puis réessaie.";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "L'accès à la caméra est refusé. Autorise la caméra dans le navigateur puis réessaie.";
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "Aucune caméra n'a été trouvée sur cet appareil.";
  }

  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "La caméra est déjà utilisée par une autre application ou un autre onglet.";
  }

  return "Impossible d'accéder à la caméra. Vérifie les permissions puis réessaie.";
}

function toPersistableImageUrl(imageUrl: string | undefined) {
  if (!imageUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function getInventoryBatchErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;

  if (response.status === 400) {
    return "Données invalides. Vérifie le code-barres, la quantité, la date ou l'image du produit.";
  }

  return payload?.message ?? "Impossible d'ajouter le produit pour le moment.";
}
