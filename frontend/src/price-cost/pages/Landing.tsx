import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../landing.css";

// Remember the first entrance until a full reload; returning home stays still.
let introductionShown = false;

export default function Landing() {
  const [enter] = useState(() => !introductionShown);
  useEffect(() => {
    introductionShown = true;
  }, []);

  return (
    <section className={`pc-home-introduction${enter ? " pc-home-enter" : ""}`}>
      <h1>
        Europe’s prices,
        <br />
        <span>in perspective.</span>
      </h1>
      <p className="pc-home-description">
        Explore fuel prices, consumer inflation and euro exchange rates, with
        clear comparisons from official European sources.
      </p>
      <div className="pc-home-action">
        <Link className="pc-button pc-primary" to="/app/overview">
          Open the workspace <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
