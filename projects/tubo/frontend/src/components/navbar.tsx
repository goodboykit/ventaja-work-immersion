"use client";

import { ChevronDown, LogOut, Plus } from "lucide-react";
import { useState } from "react";
import { initialsFromEmail } from "@/lib/format";
import { useApp } from "@/providers/providers";

interface NavbarProps {
    onCreateInvoice: () => void;
}

export function Navbar({ onCreateInvoice }: NavbarProps) {
    const { session, signOut } = useApp();
    const email = session?.user.email ?? null;
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
                {/* Left: brand */}
                <div className="flex items-center gap-3">
                    <img src="/ventaja_image-removebg-preview.png" alt="Ventaja" className="h-35 w-auto object-contain" />
                    <span className="hidden sm:block text-sm text-slate-400">|</span>
                    <span className="hidden sm:block text-sm text-slate-500">Invoicing &amp; Billing</span>
                </div>

                {/* Right: user + create */}
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onCreateInvoice}
                        className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-dark transition"
                    >
                        <Plus className="h-4 w-4" />
                        Create Invoice
                    </button>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="flex items-center gap-2 rounded-full border border-slate-200 pl-1 pr-2.5 py-1 hover:border-slate-300 transition"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                                {initialsFromEmail(email)}
                            </div>
                            <div className="hidden sm:block text-left">
                                <p className="text-sm font-medium text-slate-800 leading-tight">{email?.split("@")[0] ?? "User"}</p>
                                <p className="text-[11px] text-slate-400 leading-tight">Billing</p>
                            </div>
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>

                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                    <div className="px-3 py-2 border-b border-slate-100">
                                        <p className="text-sm font-medium text-slate-800 truncate">{email}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setMenuOpen(false); signOut(); }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <LogOut className="h-4 w-4" /> Sign out
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
