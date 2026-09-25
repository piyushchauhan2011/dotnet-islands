using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

// Called inside the CMS mutation transaction: removed routes must lose their old HTML immediately.
internal static class SnapshotInvalidation
{
    public static async Task Update(
        HotelDbContext db, string kind, string id, string? oldPath,
        string? oldDestinationId, string? oldHotelId)
    {
        var catalog = await LoadCatalog(db);
        var published = PublishedPaths(catalog);
        var affected = await AffectedPaths(
            db, catalog, kind, id, oldPath, oldDestinationId, oldHotelId);
        await EnqueueOrRemove(db, published, affected);
    }

    private sealed record DestinationRow(string Id, string Slug, string Status);
    private sealed record HotelRow(string Id, string Slug, string DestinationId, string Status);
    private sealed record OfferRow(string Id, string Slug, string HotelId, string Status);
    private sealed record PostRow(string Id, string Slug, string Status);
    private sealed record Catalog(
        List<DestinationRow> Destinations, List<HotelRow> Hotels,
        List<OfferRow> Offers, List<PostRow> Posts);

    private static async Task<Catalog> LoadCatalog(HotelDbContext db)
    {
        var destinations = await db.Destinations.AsNoTracking()
            .Select(x => new DestinationRow(x.Id, x.Slug, x.Status)).ToListAsync();
        var hotels = await db.Hotels.AsNoTracking()
            .Select(x => new HotelRow(x.Id, x.Slug, x.DestinationId, x.Status)).ToListAsync();
        var offers = await db.Offers.AsNoTracking()
            .Select(x => new OfferRow(x.Id, x.Slug, x.HotelId, x.Status)).ToListAsync();
        var posts = await db.BlogPosts.AsNoTracking()
            .Select(x => new PostRow(x.Id, x.Slug, x.Status)).ToListAsync();
        return new Catalog(destinations, hotels, offers, posts);
    }

    private static HashSet<string> PublishedPaths(Catalog catalog)
    {
        var destinations = catalog.Destinations.Where(x => x.Status == "published")
            .ToDictionary(x => x.Id);
        var hotels = catalog.Hotels.Where(x =>
            x.Status == "published" && destinations.ContainsKey(x.DestinationId))
            .ToDictionary(x => x.Id);
        var offers = catalog.Offers.Where(x =>
            x.Status == "published" && hotels.ContainsKey(x.HotelId));
        var published = new HashSet<string>(StringComparer.Ordinal)
        {
            "/", "/destinations", "/blog", "/search"
        };
        published.UnionWith(destinations.Values.Select(x => $"/destinations/{x.Slug}"));
        published.UnionWith(hotels.Values.Select(x => $"/hotels/{x.Slug}"));
        published.UnionWith(offers.Select(x =>
            $"/hotels/{hotels[x.HotelId].Slug}/offers/{x.Slug}"));
        published.UnionWith(catalog.Posts.Where(x => x.Status == "published")
            .Select(x => $"/blog/{x.Slug}"));
        return published;
    }

    private static async Task<HashSet<string>> AffectedPaths(
        HotelDbContext db, Catalog catalog, string kind, string id,
        string? oldPath, string? oldDestinationId, string? oldHotelId)
    {
        var destinations = catalog.Destinations;
        var hotels = catalog.Hotels;
        var offers = catalog.Offers;
        var posts = catalog.Posts;
        var (affected, destinationIds, hotelIds) = await SelectRoots(
            db, catalog, kind, id, oldPath, oldDestinationId, oldHotelId);
        foreach (var destinationId in destinationIds)
        {
            var destination = destinations.FirstOrDefault(x => x.Id == destinationId);
            if (destination is not null)
                affected.Add($"/destinations/{destination.Slug}");
            foreach (var hotel in hotels.Where(x => x.DestinationId == destinationId))
                hotelIds.Add(hotel.Id);
        }
        foreach (var hotelId in hotelIds)
        {
            var hotel = hotels.FirstOrDefault(x => x.Id == hotelId);
            if (hotel is null)
                continue;
            affected.Add($"/hotels/{hotel.Slug}");
            affected.Add("/destinations");
            var destination = destinations.FirstOrDefault(x => x.Id == hotel.DestinationId);
            if (destination is not null)
                affected.Add($"/destinations/{destination.Slug}");
            foreach (var offer in offers.Where(x => x.HotelId == hotelId))
                affected.Add($"/hotels/{hotel.Slug}/offers/{offer.Slug}");
        }
        if (kind == "posts" && posts.FirstOrDefault(x => x.Id == id) is { } post)
            affected.Add($"/blog/{post.Slug}");

        // Hotel renames also invalidate stale offer URLs, including drafts.
        if (kind == "hotels" && oldPath is not null)
        {
            var prefix = oldPath + "/offers/";
            affected.UnionWith(await db.PageSnapshots.Where(x => x.Path.StartsWith(prefix))
                .Select(x => x.Path).ToListAsync());
            affected.UnionWith(await db.SnapshotJobs.Where(x => x.Path.StartsWith(prefix))
                .Select(x => x.Path).ToListAsync());
        }
        // Catalog changes may affect published articles with embedded records.
        if (kind != "posts")
            affected.UnionWith(posts.Where(x => x.Status == "published")
                .Select(x => $"/blog/{x.Slug}"));
        return affected;
    }

    private static async Task<(HashSet<string> Affected, HashSet<string> DestinationIds,
        HashSet<string> HotelIds)> SelectRoots(
        HotelDbContext db, Catalog catalog, string kind, string id,
        string? oldPath, string? oldDestinationId, string? oldHotelId)
    {
        var hotels = catalog.Hotels;
        var offers = catalog.Offers;
        var affected = new HashSet<string>(StringComparer.Ordinal) { "/" };
        if (oldPath is not null)
            affected.Add(oldPath);
        var destinationIds = new HashSet<string>(StringComparer.Ordinal);
        var hotelIds = new HashSet<string>(StringComparer.Ordinal);
        if (kind == "destinations")
        {
            destinationIds.Add(id);
            affected.Add("/destinations");
            affected.Add("/search");
        }
        else if (kind == "hotels")
        {
            hotelIds.Add(id);
            affected.Add("/search");
            affected.Add("/destinations");
            if (oldDestinationId is not null)
                destinationIds.Add(oldDestinationId);
            var hotel = hotels.FirstOrDefault(x => x.Id == id);
            if (hotel is not null)
                destinationIds.Add(hotel.DestinationId);
        }
        else if (kind is "rooms" or "offers")
        {
            affected.Add("/search");
            if (oldHotelId is not null)
                hotelIds.Add(oldHotelId);
            var hotelId = kind == "offers"
                ? offers.FirstOrDefault(x => x.Id == id)?.HotelId
                : await db.Rooms.Where(x => x.Id == id).Select(x => x.HotelId)
                    .FirstOrDefaultAsync();
            if (hotelId is not null)
                hotelIds.Add(hotelId);
        }
        else if (kind == "posts")
            affected.Add("/blog");
        return (affected, destinationIds, hotelIds);
    }

    private static async Task EnqueueOrRemove(
        HotelDbContext db, HashSet<string> published, HashSet<string> affected)
    {
        var version = Guid.NewGuid().ToString("N");
        foreach (var path in affected)
        {
            if (!published.Contains(path))
            {
                await db.PageSnapshots.Where(x => x.Path == path).ExecuteDeleteAsync();
                await db.SnapshotJobs.Where(x => x.Path == path).ExecuteDeleteAsync();
                continue;
            }
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO snapshot_jobs
                    (path, desired_version, attempts, next_attempt_at, leased_until)
                VALUES ({path}, {version}, 0, now(), NULL)
                ON CONFLICT (path) DO UPDATE
                SET desired_version = EXCLUDED.desired_version, attempts = 0,
                    next_attempt_at = now(), leased_until = NULL
                """);
        }
    }
}
