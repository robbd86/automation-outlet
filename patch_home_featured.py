#!/usr/bin/env python3
"""Add a compact three-item Star Buys section to the generated homepage.\n\nHomepage only: no stock records are edited by this patch.\n"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"

SECTION = r'''<section id="home-featured-stock" class="home-featured-stock" hidden>
  <style>
    .home-featured-stock{padding:3rem 0;background:var(--navy);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
    .home-featured-head{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.25rem}
    .home-featured-head .sec-head{margin-bottom:0}
    .home-featured-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
    .home-featured-card{background:var(--navy-card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;min-width:0}
    .home-featured-image{position:relative;display:block;aspect-ratio:4/3;background:linear-gradient(145deg,#13294e,#09172f);overflow:hidden}
    .home-featured-image img{width:100%;height:100%;display:block;object-fit:cover}
    .home-featured-fallback{height:100%;display:grid;place-content:center;text-align:center;color:var(--grey);padding:1rem}
    .home-featured-fallback strong{display:block;color:var(--white);font-family:'Barlow Condensed';font-size:1.5rem;text-transform:uppercase}
    .home-star-badge{position:absolute;top:.65rem;right:.65rem;background:var(--blue);border:1px solid var(--blue-bright);border-radius:999px;padding:.35rem .7rem;font-family:'IBM Plex Mono';font-size:.68rem;letter-spacing:.08em;color:var(--white)}
    .home-featured-body{padding:1.05rem;display:flex;flex-direction:column;flex:1}
    .home-featured-meta{font-family:'IBM Plex Mono';font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--blue-bright)}
    .home-featured-title{font-size:1.25rem;line-height:1.12;margin:.45rem 0;text-transform:none}
    .home-featured-title a{color:inherit;text-decoration:none}.home-featured-title a:hover{color:var(--blue-bright)}
    .home-featured-part{font-family:'IBM Plex Mono';font-size:.78rem;color:var(--white);word-break:break-word}
    .home-featured-condition{font-size:.82rem;color:var(--grey);margin:.55rem 0 1rem}
    .home-featured-bottom{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-top:auto;padding-top:.9rem;border-top:1px solid var(--line)}
    .home-featured-price{font-family:'Barlow Condensed';font-size:1.7rem;font-weight:800;color:var(--white)}
    .home-featured-bottom .btn{padding:.6rem .8rem;font-size:.88rem;white-space:nowrap}
    .home-featured-secondary{margin-top:.65rem;text-align:right}
    .home-featured-link{font-size:.78rem;color:var(--blue-bright)}
    .home-featured-all{white-space:nowrap}
    @media(max-width:850px){
      .home-featured-head{align-items:start;flex-direction:column}
      .home-featured-grid{display:flex;overflow-x:auto;gap:.85rem;scroll-snap-type:x mandatory;padding-bottom:.35rem}
      .home-featured-card{flex:0 0 min(84vw,340px);scroll-snap-align:start}
      .home-featured-all{margin-top:.15rem}
    }
  </style>
  <div class="wrap">
    <div class="home-featured-head">
      <div class="sec-head">
        <div class="eyebrow">Hand-picked stock</div>
        <h2>Automation Outlet <span>Star Buys</span></h2>
        <p>Three standout automation parts available now. Tap an item for full details, condition and buying options.</p>
      </div>
      <a class="home-featured-all" href="/buy-stock.html#stock">View all current stock &rarr;</a>
    </div>
    <div class="home-featured-grid" id="homeFeaturedGrid" aria-live="polite"></div>
  </div>
</section>
<script src="/home-featured.js" defer></script>
'''


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    if 'id="home-featured-stock"' in html:
        print("homepage featured stock already present")
        return

    marker = '<section style="padding:2.4rem 0">'
    if marker not in html:
        raise RuntimeError("Could not find homepage featured-stock insertion point")

    html = html.replace(marker, SECTION + marker, 1)
    INDEX.write_text(html, encoding="utf-8")
    print("patched: homepage Star Buys")


if __name__ == "__main__":
    main()
