"use client";

import { type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Camera, ChevronLeft, Keyboard, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { cn } from "@/lib/cn";
import { persistableOffImageUrl } from "@/lib/image-proxy";
import { getBrowserAuthHeaders } from "@/lib/supabase/browser-auth";
import type { QuantityUnit, StorageArea } from "@/types/domain";

type AddProductStep = "choice" | "scanner" | "resolvingProduct" | "form";

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
  initialMode?: "choice" | "manual" | "scan";
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

export function AddProductDialog({ initialMode = "choice", open, onClose, onPersisted }: AddProductDialogProps) {
  const [step, setStep] = useState<AddProductStep>("choice");
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
  const startCameraScanRef = useRef<(() => Promise<void>) | null>(null);
  const resolvingScanRef = useRef(false);

  const stopCamera = useCallback(() => {
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
  }, []);

  const resetForm = useCallback(() => {
    stopCamera();
    resolvingScanRef.current = false;
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
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    startCameraScanRef.current = startCameraScan;
  });

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    resetForm();
    setStep(getInitialStep(initialMode));
  }, [initialMode, open, resetForm, stopCamera]);

  useEffect(() => {
    if (!open) {
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
    if (!open || step !== "scanner") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void startCameraScanRef.current?.();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [open, step]);

  if (!open) {
    return null;
  }

  async function resolveBarcode(barcodeValue?: string) {
    const cleanBarcode = (barcodeValue ?? barcode).trim();

    if (!cleanBarcode) {
      setLookup({ status: "error", message: "Renseigne d'abord un code-barres." });
      setStep("form");
      return;
    }

    setBarcode(cleanBarcode);
    setScanError(null);
    setSubmitError(null);
    setValidationMessage(null);
    setLookup({ status: "loading" });
    setStep("resolvingProduct");

    try {
      const response = await fetch(`/api/products/lookup/${encodeURIComponent(cleanBarcode)}`, {
        cache: "no-store"
      });

      if (response.status === 404) {
        setLookup({ status: "not-found" });
        setStep("form");
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
      setStep("form");
    } catch {
      setLookup({ status: "error", message: "Impossible de joindre Open Food Facts. Tu peux compléter le produit manuellement." });
      setStep("form");
    } finally {
      resolvingScanRef.current = false;
    }
  }

  async function handleDetectedBarcode(detectedCode: string) {
    const cleanBarcode = detectedCode.trim();

    if (!cleanBarcode || resolvingScanRef.current) {
      return;
    }

    resolvingScanRef.current = true;
    stopCamera();
    await resolveBarcode(cleanBarcode);
  }

  async function startCameraScan() {
    setScanError(null);
    setValidationMessage(null);
    resolvingScanRef.current = false;

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
              await handleDetectedBarcode(detectedCode);
              return;
            }
          } catch {
            // Continue scanning while the camera stream is alive.
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
        if (detectedCode) {
          void handleDetectedBarcode(detectedCode);
        }
      });
    } catch (error) {
      stopCamera();
      setScanError(getCameraAccessErrorMessage(error));
    }
  }

  function showChoice() {
    stopCamera();
    setScanError(null);
    setValidationMessage(null);
    setStep("choice");
  }

  function showScanner() {
    stopCamera();
    setScanError(null);
    setValidationMessage(null);
    setStep("scanner");
  }

  function showManualForm() {
    stopCamera();
    setScanError(null);
    setValidationMessage(null);
    if (lookup.status === "loading") {
      setLookup({ status: "idle" });
    }
    setStep("form");
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

  const header = getHeaderCopy(step, lookup);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:p-4">
      <form
        onSubmit={(event) => void submitForm(event)}
        className={cn(
          "flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-soft",
          step === "scanner"
            ? "min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)] sm:min-h-0 sm:max-h-[calc(100dvh-2rem)]"
            : "max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)] sm:max-h-[calc(100dvh-2rem)]"
        )}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold sm:text-xl">{header.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{header.description}</p>
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

        <div className={cn("flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4", step === "scanner" && "flex flex-col")}>
          {step === "choice" ? (
            <ChoiceStep onScan={showScanner} onManual={showManualForm} onBarcodeEntry={showManualForm} />
          ) : null}

          {step === "scanner" ? (
            <ScannerStep
              isScanning={isScanning}
              scanError={scanError}
              videoRef={videoRef}
              onRetry={showScanner}
              onCancel={showChoice}
              onManual={showManualForm}
            />
          ) : null}

          {step === "resolvingProduct" ? <ResolvingStep barcode={barcode} /> : null}

          {step === "form" ? (
            <FormStep
              barcode={barcode}
              name={name}
              quantity={quantity}
              unit={unit}
              storageArea={storageArea}
              expirationDate={expirationDate}
              lookup={lookup}
              validationMessage={validationMessage}
              submitError={submitError}
              isSubmitting={isSubmitting}
              onBarcodeChange={setBarcode}
              onNameChange={setName}
              onQuantityChange={setQuantity}
              onUnitChange={setUnit}
              onStorageAreaChange={setStorageArea}
              onExpirationDateChange={setExpirationDate}
              onLookup={() => void resolveBarcode()}
            />
          ) : null}
        </div>

        {step === "form" ? (
          <div className="grid shrink-0 grid-cols-[0.85fr_1.15fr] gap-2 border-t border-slate-100 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:grid-cols-2 sm:px-5 sm:pb-4">
            <Button variant="secondary" className="h-10" onClick={showChoice} disabled={isSubmitting}>
              Retour
            </Button>
            <Button type="submit" className="h-10" disabled={isSubmitting}>
              {isSubmitting ? "Ajout..." : "Ajouter au stock"}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function ChoiceStep({ onScan, onManual, onBarcodeEntry }: { onScan: () => void; onManual: () => void; onBarcodeEntry: () => void }) {
  return (
    <div className="flex min-h-[18rem] flex-col justify-center gap-3 py-3 sm:min-h-[22rem] sm:gap-4">
      <button
        type="button"
        onClick={onScan}
        className="group flex min-h-28 w-full items-center gap-4 rounded-2xl bg-brand-600 p-4 text-left text-white transition hover:bg-brand-700 sm:min-h-32 sm:p-5"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Camera className="h-7 w-7" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-bold sm:text-xl">Scanner un produit</span>
          <span className="mt-1 block text-sm leading-5 text-white/85">Le plus rapide pour reconnaître un code-barres.</span>
        </span>
      </button>

      <button
        type="button"
        onClick={onManual}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left text-slate-900 transition hover:bg-slate-50"
      >
        <Keyboard className="h-5 w-5 shrink-0 text-slate-500" />
        <span className="min-w-0">
          <span className="block font-semibold">Ajouter manuellement</span>
          <span className="mt-0.5 block text-sm text-slate-500">Pour un produit sans code ou si le scan ne passe pas.</span>
        </span>
      </button>

      <button type="button" onClick={onBarcodeEntry} className="mx-auto rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        Saisir un code-barres
      </button>
    </div>
  );
}

function ScannerStep({
  isScanning,
  scanError,
  videoRef,
  onRetry,
  onCancel,
  onManual
}: {
  isScanning: boolean;
  scanError: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onRetry: () => void;
  onCancel: () => void;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="relative min-h-[22rem] flex-1 overflow-hidden rounded-2xl bg-slate-950 sm:min-h-[24rem]">
        <video ref={videoRef} className="h-full min-h-[22rem] w-full object-cover sm:min-h-[24rem]" muted playsInline />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/35" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-2xl border-2 border-white/85 shadow-[0_0_0_999px_rgba(15,23,42,0.28)] sm:inset-x-16 sm:h-32" />
        <div className="absolute inset-x-4 bottom-4 rounded-xl bg-white/92 px-3 py-2 text-center text-sm font-medium text-slate-800 backdrop-blur">
          {scanError ? scanError : isScanning ? "Place le code-barres dans le cadre" : "Préparation de la caméra..."}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="h-10 gap-2" onClick={onCancel}>
          <ChevronLeft className="h-4 w-4" />
          Annuler
        </Button>
        <Button type="button" variant={scanError ? "primary" : "secondary"} className="h-10 gap-2" onClick={scanError ? onRetry : onManual}>
          {scanError ? <Camera className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
          {scanError ? "Réessayer" : "Saisie manuelle"}
        </Button>
      </div>

      {scanError ? (
        <Button type="button" variant="ghost" className="h-10 w-full" onClick={onManual}>
          Ajouter manuellement
        </Button>
      ) : null}
    </div>
  );
}

function ResolvingStep({ barcode }: { barcode: string }) {
  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
      <p className="mt-4 text-base font-semibold text-slate-950">Recherche du produit...</p>
      <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">Code détecté : {barcode}</p>
    </div>
  );
}

function FormStep({
  barcode,
  name,
  quantity,
  unit,
  storageArea,
  expirationDate,
  lookup,
  validationMessage,
  submitError,
  isSubmitting,
  onBarcodeChange,
  onNameChange,
  onQuantityChange,
  onUnitChange,
  onStorageAreaChange,
  onExpirationDateChange,
  onLookup
}: {
  barcode: string;
  name: string;
  quantity: string;
  unit: QuantityUnit;
  storageArea: StorageArea;
  expirationDate: string;
  lookup: LookupState;
  validationMessage: string | null;
  submitError: string | null;
  isSubmitting: boolean;
  onBarcodeChange: (nextValue: string) => void;
  onNameChange: (nextValue: string) => void;
  onQuantityChange: (nextValue: string) => void;
  onUnitChange: (nextValue: QuantityUnit) => void;
  onStorageAreaChange: (nextValue: StorageArea) => void;
  onExpirationDateChange: (nextValue: string) => void;
  onLookup: () => void;
}) {
  return (
    <div className="space-y-3 sm:space-y-4">
      {lookup.status === "found" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <div className="flex items-start gap-3 font-semibold">
            <ProductThumbnail
              name={lookup.label}
              imageUrl={lookup.imageUrl}
              fallbackLabel={lookup.label}
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-200 bg-white text-xs font-bold text-emerald-700"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Barcode className="h-4 w-4" />
                <span>Produit détecté</span>
              </div>
              <p className="truncate font-semibold text-emerald-900">{lookup.label}</p>
              {lookup.brand ? <p className="truncate text-emerald-700">Marque : {lookup.brand}</p> : null}
            </div>
          </div>
          {lookup.category ? <p className="mt-2 text-emerald-700">Catégorie : {lookup.category}</p> : null}
          {lookup.quantityText ? <p className="text-emerald-700">Quantité : {lookup.quantityText}</p> : null}
        </div>
      ) : null}

      {lookup.status === "not-found" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Produit non trouvé. Le code-barres est conservé, complète les infos manuellement.
        </div>
      ) : null}

      {lookup.status === "error" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {lookup.message}
        </div>
      ) : null}

      <label className={fieldClass}>
        <span>Code-barres</span>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            className={controlClass}
            value={barcode}
            onChange={(event) => onBarcodeChange(event.target.value)}
            inputMode="numeric"
            placeholder="Ex : 7376280645028"
          />
          <Button type="button" variant="secondary" className="h-10 gap-2 px-3 sm:h-11" onClick={onLookup} disabled={isSubmitting}>
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Chercher</span>
          </Button>
        </div>
      </label>

      <label className={fieldClass}>
        <span>Nom du produit</span>
        <input className={controlClass} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ex : Riz basmati" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={fieldClass}>
          <span>Quantité</span>
          <input className={controlClass} value={quantity} onChange={(event) => onQuantityChange(event.target.value)} inputMode="decimal" />
        </label>

        <label className={fieldClass}>
          <span>Unité</span>
          <select className={controlClass} value={unit} onChange={(event) => onUnitChange(event.target.value as QuantityUnit)}>
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
          <select className={controlClass} value={storageArea} onChange={(event) => onStorageAreaChange(event.target.value as StorageArea)}>
            {storageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass}>
          <span>DLC facultative</span>
          <input className={controlClass} value={expirationDate} onChange={(event) => onExpirationDateChange(event.target.value)} type="date" />
        </label>
      </div>

      {validationMessage ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{validationMessage}</p> : null}
      {submitError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</p> : null}
      {isSubmitting ? <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Ajout en cours...</p> : null}
    </div>
  );
}

function getInitialStep(initialMode: AddProductDialogProps["initialMode"]): AddProductStep {
  if (initialMode === "scan") {
    return "scanner";
  }

  if (initialMode === "manual") {
    return "form";
  }

  return "choice";
}

function getHeaderCopy(step: AddProductStep, lookup: LookupState) {
  if (step === "scanner") {
    return {
      title: "Scanner un produit",
      description: "Place le code-barres dans le cadre."
    };
  }

  if (step === "resolvingProduct") {
    return {
      title: "Produit détecté",
      description: "On récupère les informations du produit."
    };
  }

  if (step === "form") {
    if (lookup.status === "found") {
      return {
        title: "Confirmer le produit",
        description: "Ajuste la quantité, la zone et la DLC avant l'ajout."
      };
    }

    if (lookup.status === "not-found" || lookup.status === "error") {
      return {
        title: "Compléter le produit",
        description: "Le code est gardé, il reste les infos utiles à remplir."
      };
    }

    return {
      title: "Ajouter manuellement",
      description: "Renseigne les infos du produit à ajouter au stock."
    };
  }

  return {
    title: "Ajouter un produit",
    description: "Scanne ton produit ou ajoute-le manuellement."
  };
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
  return persistableOffImageUrl(imageUrl, window.location.origin);
}

async function getInventoryBatchErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;

  if (response.status === 400) {
    return "Données invalides. Vérifie le code-barres, la quantité, la date ou l'image du produit.";
  }

  return payload?.message ?? "Impossible d'ajouter le produit pour le moment.";
}
