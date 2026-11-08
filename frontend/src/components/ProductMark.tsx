import type { SVGProps } from "react";

export function ProductMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M7 22.5v-5M13 22.5V13M19 22.5v-7M25 22.5V9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m7 13.5 6-4 6 2.5 6-6" stroke="#FD6E88" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="13.5" r="1.7" fill="#FD6E88" />
      <circle cx="25" cy="6" r="1.7" fill="#FD6E88" />
    </svg>
  );
}
