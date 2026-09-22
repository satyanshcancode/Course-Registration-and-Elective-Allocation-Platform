import { ShoppingCart } from 'lucide-react';
import { FeaturePlaceholder } from '../FeaturePlaceholder';

export function CartPage() {
  return (
    <FeaturePlaceholder
      title="My cart"
      kicker="Fall 2026 · Registration"
      description="Rank up to five courses, save a draft and submit once."
      icon={ShoppingCart}
      emptyTitle="Your cart is empty"
    >
      <p>
        Adding and ranking courses arrives in a later phase. Submitting will be a single step: all
        of your choices are saved together, or none are.
      </p>
    </FeaturePlaceholder>
  );
}
