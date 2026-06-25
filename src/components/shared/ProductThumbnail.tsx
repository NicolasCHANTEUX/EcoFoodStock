"use client";

import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { persistableOffImageUrl } from "@/lib/image-proxy";

type ProductThumbnailProps = {
  name: string;
  imageUrl?: string;
  fallbackLabel?: string;
  className?: string;
};

const IMAGE_RETRY_DELAYS_MS = [1_200, 3_500];

export function ProductThumbnail({ name, imageUrl, fallbackLabel, className }: ProductThumbnailProps) {
  const [imageSource, setImageSource] = useState<"primary" | "direct" | "fallback">("primary");
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const directImageUrl = imageUrl?.startsWith("/api/images") ? persistableOffImageUrl(imageUrl) : undefined;
  const imageSrc =
    imageSource === "direct" && directImageUrl
      ? directImageUrl
      : imageSource === "primary" && imageUrl
        ? appendRetryParam(imageUrl, retryCount)
        : undefined;
  const showImage = Boolean(imageSrc);
  const initials = (fallbackLabel ?? name)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || "PR";

  useEffect(() => {
    clearImageRetryTimeout(retryTimeoutRef);
    setImageSource("primary");
    setRetryCount(0);

    return () => clearImageRetryTimeout(retryTimeoutRef);
  }, [imageUrl]);

  return (
    <div className={className ?? "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-bold text-slate-600"}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={name}
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (imageSource === "primary" && directImageUrl && directImageUrl !== imageUrl) {
              setRetryCount(0);
              setImageSource("direct");
              return;
            }

            if (imageSource === "primary" && canRetryImage(imageUrl, retryCount)) {
              const nextRetryCount = retryCount + 1;
              setImageSource("fallback");
              clearImageRetryTimeout(retryTimeoutRef);
              retryTimeoutRef.current = window.setTimeout(() => {
                setRetryCount(nextRetryCount);
                setImageSource("primary");
              }, IMAGE_RETRY_DELAYS_MS[retryCount]);
              return;
            }

            setImageSource("fallback");
          }}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}

function canRetryImage(imageUrl: string | undefined, retryCount: number) {
  return Boolean(imageUrl?.startsWith("/api/images")) && retryCount < IMAGE_RETRY_DELAYS_MS.length;
}

function appendRetryParam(imageUrl: string, retryCount: number) {
  if (retryCount <= 0) {
    return imageUrl;
  }

  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}_retry=${retryCount}`;
}

function clearImageRetryTimeout(retryTimeoutRef: MutableRefObject<number | null>) {
  if (retryTimeoutRef.current === null) {
    return;
  }

  window.clearTimeout(retryTimeoutRef.current);
  retryTimeoutRef.current = null;
}
