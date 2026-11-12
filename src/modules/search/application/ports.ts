import type { ExploreQuery } from "./contracts";

export interface OutfitCard {
  id: string;
  slug: string;
  title: string;
  categoryName: string;
  localityName: string;
  sizeLabel: string;
  occasions: string[];
  /** Price for the requested duration when one was chosen, otherwise the lowest price offered. */
  pricePaise: number;
  priceDays: number;
  depositPaise: number;
  photoKey: string | null;
  photoAlt: string | null;
  ownerName: string;
}

export interface ExploreResult {
  items: OutfitCard[];
  total: number;
  page: number;
  pageCount: number;
}

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  audience: string;
  description: string | null;
}

export interface OutfitDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  brand: string | null;
  colour: string | null;
  fabric: string | null;
  sizeLabel: string;
  conditionGrade: string;
  conditionNotes: string;
  retailValuePaise: number;
  depositPaise: number;
  turnaroundDays: number;
  occasions: string[];
  category: { slug: string; name: string };
  locality: { name: string; city: string };
  photos: Array<{ key: string; alt: string; width: number; height: number }>;
  measurementsMm: Record<string, number | null>;
  measurementNotes: string | null;
  prices: Array<{ durationDays: number; pricePaise: number }>;
  owner: {
    id: string;
    displayName: string;
    memberSince: Date;
    emailVerified: boolean;
    phoneVerified: boolean;
    rating: number | null;
    ratingCount: number;
    completedRentals: number;
    /** Suspended by an administrator: the listing is hidden from everyone but admins. */
    suspended: boolean;
  };
  publishedAt: Date | null;
}

export interface CatalogueQueries {
  explore(query: ExploreQuery, today: string): Promise<ExploreResult>;
  categories(): Promise<CategoryOption[]>;
  localities(): Promise<Array<{ slug: string; name: string }>>;
  outfitBySlug(slug: string): Promise<OutfitDetail | null>;
  savedOutfitIds(userId: string): Promise<Set<string>>;
  savedOutfits(userId: string): Promise<OutfitCard[]>;
  toggleSaved(userId: string, outfitId: string): Promise<boolean>;
  recentlyListed(limit: number): Promise<OutfitCard[]>;
}
