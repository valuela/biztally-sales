import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>

export function Button({ children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`min-h-12 w-full rounded-lg bg-stone-900 px-5 py-3 text-[15px] font-semibold text-white outline-none transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
