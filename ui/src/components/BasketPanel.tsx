/**
 * BasketPanel
 * -----------
 * Right panel. Shows the live Sainsbury's basket with cost breakdown.
 * Fetched live from groc; not derived from run results.
 *
 * DESIGN NOTES for Claude Design:
 * - Two sub-sections: category breakdown (collapsible groups) + grand total bar.
 * - Category names come from Sainsbury's — they may be null, in which case
 *   all items are grouped under "Uncategorised".
 * - Prices are GBP. Format as £X.XX throughout.
 * - The grand total should be visually dominant — largest text in the panel.
 * - "View basket on Sainsbury's" is a secondary link, not a button.
 * - If the basket is empty, show a neutral empty state (not an error).
 */

import type { BasketItem, CategoryGroup } from "../types";

interface Props {
  items: BasketItem[];
}

function groupByCategory(items: BasketItem[]): CategoryGroup[] {
  const map = new Map<string, BasketItem[]>();
  for (const item of items) {
    const key = item.category ?? "Uncategorised";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .map(([category, items]) => ({
      category,
      items,
      subtotal: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function gbp(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

export function BasketPanel({ items }: Props) {
  const groups = groupByCategory(items);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="basket basket--empty">
        <p className="basket__empty-message">
          Sainsbury's basket is empty. Send your shopping list to add items.
        </p>
      </div>
    );
  }

  return (
    <div className="basket">
      <div className="basket__header">
        <h2 className="basket__title">Basket</h2>
        {/* DESIGN: make this a subtle text link */}
        <a
          href="https://www.sainsburys.co.uk/shop/gb/groceries/your-trolley"
          target="_blank"
          rel="noopener noreferrer"
          className="basket__view-link"
        >
          View on Sainsbury's ↗
        </a>
      </div>

      <div className="basket__categories">
        {groups.map((group) => (
          <CategoryGroup key={group.category} group={group} />
        ))}
      </div>

      {/* DESIGN: make the total visually prominent — largest number on screen */}
      <div className="basket__total-bar">
        <span className="basket__total-label">Estimated total</span>
        <span className="basket__total-amount">{gbp(total)}</span>
      </div>
    </div>
  );
}

function CategoryGroup({ group }: { group: CategoryGroup }) {
  return (
    <div className="category-group">
      <div className="category-group__header">
        <h3 className="category-group__name">{group.category}</h3>
        <span className="category-group__subtotal">{gbp(group.subtotal)}</span>
      </div>

      <ul className="category-group__items">
        {group.items.map((item) => (
          <BasketItemRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

function BasketItemRow({ item }: { item: BasketItem }) {
  return (
    <li className="basket-item">
      <span className="basket-item__name">{item.name}</span>
      <span className="basket-item__meta">
        {item.quantity > 1 && <span className="basket-item__qty">{item.quantity}×</span>}
        {item.unit && <span className="basket-item__unit">{item.unit}</span>}
      </span>
      <span className="basket-item__price">{gbp(item.price * item.quantity)}</span>
    </li>
  );
}
