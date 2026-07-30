# Automation Outlet stock catalogue

The stock catalogue is deliberately simple to run:

- Public stock appears on `/buy-stock.html`.
- Products are stored as private GitHub Issues labelled `stock-item`.
- Products are added and edited through `/stock-admin.html`.
- The public page updates dynamically, so adding a product does not require a Vercel redeploy.
- Checkout remains on eBay for now. An item can also be enquiry-only.

## Vercel configuration

The stock manager reuses the same environment variables as the seller deal desk:

| Variable | Required value |
|---|---|
| `AO_GITHUB_TOKEN` | Fine-grained GitHub token restricted to `robbd86/automation-outlet-site`, with **Issues: Read and write** |
| `AO_DEAL_DESK_KEY` | Long private password used to unlock the deal desk and stock manager |
| `AO_GITHUB_REPO` | Optional; defaults to `robbd86/automation-outlet-site` |

Set the variables for both **Preview** and **Production**, then redeploy once.

The token belongs only in Vercel. Never add it to the repository or browser code.

## Add a product

1. Open `/stock-admin.html`.
2. Enter the `AO_DEAL_DESK_KEY`.
3. Add the listing title, part number, brand, category, condition, price and quantity.
4. Paste a direct image URL.
5. Paste the exact eBay listing URL, or leave it blank for an enquiry-only product.
6. Set the item to **Active - visible** and press **Add item**.

The product is immediately available through the stock API. The public stock page caches results briefly, so allow around one minute for it to appear.

## Product photographs

For the first version, the catalogue uses a direct hosted image URL.

For an eBay image:

1. Open the listing.
2. Open the main photograph at full size.
3. Copy the image address. It normally starts with `https://i.ebayimg.com/`.
4. Paste it into **Main image URL**.

A later version can add direct image uploads if needed.

## Stock statuses

- **Active:** visible on the website while quantity is above zero.
- **Draft:** saved privately but hidden from customers.
- **Sold:** hidden and the underlying GitHub Issue is closed.

Use **Mark sold** from the stock list after an eBay or offline sale. Use **Reactivate** to put it back on sale.

## Build process

Vercel runs:

```bash
python3 build.py && python3 patch_stock.py
```

`build.py` continues generating the existing pages. `patch_stock.py` then inserts the catalogue and its JavaScript into the generated `buy-stock.html`.
