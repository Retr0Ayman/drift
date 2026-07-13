import { useState } from "react";
import { companyIcon } from "../../lib/companies";
import { colorForName } from "../../lib/format";
import "./CompanyLogo.css";

interface CompanyLogoProps {
  name: string;
  domain: string | null;
  size?: number;
}

/* Real icon (Google's favicon service -- see companies.ts for why this
   isn't Clearbit) when we have a curated domain for this publisher;
   otherwise (or if the image fails to load) falls back to the same
   generated-initials badge pattern used for scene groups -- never a
   guessed or scraped image. */
export default function CompanyLogo({ name, domain, size = 36 }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImage = domain && !failed;

  return (
    <div className="company-logo" style={{ width: size, height: size, background: showImage ? "#fff" : colorForName(name) }}>
      {showImage ? (
        <img src={companyIcon(domain)} alt="" onError={() => setFailed(true)} />
      ) : (
        <span style={{ fontSize: size * 0.36 }}>{name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
