import preview from "../assets/p01-01-marketing-preview.png";

export function MarketingPreview() {
  return (
    <img
      className="marketing-preview"
      src={preview}
      alt=""
      width={940}
      height={440}
      aria-hidden="true"
    />
  );
}
