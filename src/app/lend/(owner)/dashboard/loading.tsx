import { PageLoading } from "@/app/_components/page-loading";

// Only on pages with no not-found path: under a loading boundary the response streams with status 200, so
// a page that calls notFound() would no longer answer 404.
export default function Loading() {
  return <PageLoading label="Loading your outfits" />;
}
