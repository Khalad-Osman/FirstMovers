import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid gap-2">
      <h1 className="text-[1.5rem] font-semibold">Not found</h1>
      <p className="text-meta">That brief or page doesn&apos;t exist, or it was deleted.</p>
      <Link href="/" className="link w-fit">
        Back to the Opportunity Feed
      </Link>
    </div>
  );
}
