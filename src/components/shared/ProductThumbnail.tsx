"use client";

import { type MutableRefObject, useEffect, useRef, useState } from "react";

type ProductThumbnailProps = {
  name: string;
  imageUrl?: string;
  fallbackLabel?: string;
  className?: string;
};

const IMAGE_RETRY_DELAYS_MS = [1_200, 3_500];

export function ProductThumbnail({ name, imageUrl, fallbackLabel, className }: ProductThumbnailProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const imageSrc = imageUrl ? appendRetryParam(imageUrl, retryCount) : undefined;
  const showImage = Boolean(imageUrl) && !hasImageError;
  const initials = (fallbackLabel ?? name)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || "PR";

  useEffect(() => {
    clearImageRetryTimeout(retryTimeoutRef);
    setHasImageError(false);
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
            if (canRetryImage(imageUrl, retryCount)) {
              const nextRetryCount = retryCount + 1;
              setHasImageError(true);
              clearImageRetryTimeout(retryTimeoutRef);
              retryTimeoutRef.current = window.setTimeout(() => {
                setRetryCount(nextRetryCount);
                setHasImageError(false);
              }, IMAGE_RETRY_DELAYS_MS[retryCount]);
              return;
            }

            setHasImageError(true);
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
