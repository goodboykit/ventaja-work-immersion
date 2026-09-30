export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/ventaja_image-removebg-preview.png"
        alt="Ventaja"
        className="h-[200px] w-auto object-contain scale-125"
      />
    </div>
  );
}
