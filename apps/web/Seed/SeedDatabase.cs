using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using NpgsqlTypes;

namespace Hotel.Web.Data;

public static class SeedDatabase
{
    public static async Task RunAsync(
        HotelDbContext db, IConfiguration configuration,
        CancellationToken cancellationToken = default)
    {
        var assembly = typeof(SeedDatabase).Assembly;
        var fixtureResource = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith(".Seed.fixtures.json", StringComparison.Ordinal));
        await using var fixtureStream = assembly.GetManifestResourceStream(fixtureResource)
            ?? throw new InvalidOperationException("The embedded catalog fixture is missing.");
        using var fixture = await JsonDocument.ParseAsync(
            fixtureStream, cancellationToken: cancellationToken);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await InsertCatalog(db, fixture.RootElement, cancellationToken);
        await InsertAmenities(db, fixture.RootElement, cancellationToken);
        await EnsureAdmin(db, configuration, cancellationToken);
        await QueueMissingSnapshots(db, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task InsertCatalog(
        HotelDbContext db, JsonElement root, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        await InsertAsync(db, root, "destinationSeeds", "destinations", ct, row =>
        {
            row["eyebrow"] = "Field guide";
            row["content"] = JsonNode.Parse(root.GetProperty("sampleRichContent").GetRawText());
            row["heroImage"] = root.GetProperty("heroImage").GetString();
            row["seoTitle"] = $"{row["name"]!.GetValue<string>()} hotels and travel guide";
            row["seoDescription"] = row["summary"]!.GetValue<string>();
            row["status"] = "published";
            row["publishedAt"] = now;
        });
        await InsertAsync(db, root, "hotelSeeds", "hotels", ct, row => row["publishedAt"] = now);
        await InsertAsync(db, root, "amenitySeeds", "amenities", ct);
        await InsertAsync(db, root, "roomSeeds", "rooms", ct);
        await InsertAsync(db, root, "hotelGalleryImageSeeds", "hotel_gallery_images", ct);
        await InsertAsync(db, root, "hotelHighlightSeeds", "hotel_highlights", ct);
        await InsertAsync(db, root, "hotelFactSeeds", "hotel_facts", ct);
        await InsertAsync(db, root, "hotelFaqSeeds", "hotel_faqs", ct);
        await InsertAsync(db, root, "hotelNearbyPlaceSeeds", "hotel_nearby_places", ct);
        await InsertAsync(db, root, "hotelPolicySeeds", "hotel_policies", ct);
        await InsertAsync(db, root, "hotelReviewScoreSeeds", "hotel_review_scores", ct);
        await InsertAsync(db, root, "hotelReviewSeeds", "hotel_reviews", ct);
        await InsertAsync(db, root, "offerSeeds", "offers", ct);
        await InsertAsync(db, root, "postSeeds", "blog_posts", ct, row => row["publishedAt"] = now);
    }

    private static async Task InsertAmenities(
        HotelDbContext db, JsonElement root, CancellationToken ct)
    {
        var amenities = root.GetProperty("amenitySeeds").EnumerateArray().ToArray();
        var hotelLinks = new List<(string HotelId, string AmenityId)>();
        var generatedHotels = root.GetProperty("generatedHotelSeeds").EnumerateArray().ToArray();
        for (var hotelIndex = 0; hotelIndex < generatedHotels.Length; hotelIndex++)
            for (var index = 0; index < Math.Min(13, amenities.Length); index++)
                if ((index + hotelIndex) % 3 != 0)
                    hotelLinks.Add((
                        generatedHotels[hotelIndex].GetProperty("id").GetString()!,
                        amenities[index].GetProperty("id").GetString()!));
        foreach (var amenity in root.GetProperty("bengaluruAmenitySeeds").EnumerateArray())
            if (amenity.GetProperty("appliesTo").GetString() != "room")
                hotelLinks.Add(("hotel-bengaluru-jayanagar",
                    amenity.GetProperty("id").GetString()!));
        await InsertLinksAsync(db, "hotel_amenities", "hotel_id", hotelLinks, ct);

        var roomLinks = new List<(string RoomId, string AmenityId)>();
        var generatedRooms = root.GetProperty("generatedRoomSeeds").EnumerateArray().ToArray();
        for (var roomIndex = 0; roomIndex < generatedRooms.Length; roomIndex++)
        {
            var count = 0;
            for (var index = 0; index < Math.Min(13, amenities.Length) && count < 4; index++)
            {
                if ((index + roomIndex) % 2 != 0)
                    continue;
                roomLinks.Add((
                    generatedRooms[roomIndex].GetProperty("id").GetString()!,
                    amenities[index].GetProperty("id").GetString()!));
                count++;
            }
        }
        foreach (var room in root.GetProperty("roomSeeds").EnumerateArray())
            if (room.GetProperty("hotelId").GetString() == "hotel-bengaluru-jayanagar")
                foreach (var amenityId in new[]
                    {
                        "amenity-free-wifi", "amenity-air-conditioning",
                        "amenity-ensuite-bathroom", "amenity-personal-locker"
                    })
                    roomLinks.Add((room.GetProperty("id").GetString()!, amenityId));
        await InsertLinksAsync(db, "room_amenities", "room_id", roomLinks, ct);
    }

    private static async Task EnsureAdmin(
        HotelDbContext db, IConfiguration configuration, CancellationToken ct)
    {
        if (await db.AdminUsers.AnyAsync(ct))
            return;
        var environment = configuration["ASPNETCORE_ENVIRONMENT"] ??
            configuration["DOTNET_ENVIRONMENT"];
        var development = string.Equals(
            environment, "Development", StringComparison.OrdinalIgnoreCase);
        var email = configuration["ADMIN_EMAIL"];
        var password = configuration["ADMIN_PASSWORD"];
        if (development)
        {
            email ??= "admin@example.com";
            password ??= "ChangeMe123!";
        }
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException(
                "Set ADMIN_EMAIL and ADMIN_PASSWORD before seeding a non-development database.");
        // Only the first seed creates credentials; conflict-safe inserts never rotate passwords.
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO admin_users (id, email, password_hash, name) " +
            "VALUES ({0}, {1}, {2}, {3}) ON CONFLICT DO NOTHING",
            new object[]
            {
                "admin-primary", email, BCrypt.Net.BCrypt.HashPassword(password, 12),
                "Site administrator"
            }, ct);
    }

    private static async Task QueueMissingSnapshots(HotelDbContext db, CancellationToken ct)
    {
        var destinations = await db.Destinations.AsNoTracking()
            .Where(x => x.Status == "published")
            .Select(x => new { x.Id, x.Slug }).ToListAsync(ct);
        var destinationIds = destinations.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var hotels = await db.Hotels.AsNoTracking().Where(x => x.Status == "published")
            .Select(x => new { x.Id, x.DestinationId, x.Slug }).ToListAsync(ct);
        var publishedHotels = hotels.Where(x => destinationIds.Contains(x.DestinationId)).ToArray();
        var hotelSlugs = publishedHotels.ToDictionary(
            x => x.Id, x => x.Slug, StringComparer.Ordinal);
        var offers = await db.Offers.AsNoTracking().Where(x => x.Status == "published")
            .Select(x => new { x.HotelId, x.Slug }).ToListAsync(ct);
        var postSlugs = await db.BlogPosts.AsNoTracking().Where(x => x.Status == "published")
            .Select(x => x.Slug).ToListAsync(ct);
        var paths = new HashSet<string>(StringComparer.Ordinal)
            { "/", "/destinations", "/blog", "/search" };
        foreach (var destination in destinations)
            paths.Add($"/destinations/{destination.Slug}");
        foreach (var hotel in publishedHotels)
            paths.Add($"/hotels/{hotel.Slug}");
        foreach (var offer in offers)
            if (hotelSlugs.TryGetValue(offer.HotelId, out var hotelSlug))
                paths.Add($"/hotels/{hotelSlug}/offers/{offer.Slug}");
        foreach (var slug in postSlugs)
            paths.Add($"/blog/{slug}");

        var version = Guid.NewGuid().ToString("N");
        foreach (var path in paths.Order(StringComparer.Ordinal))
        {
            await db.Database.ExecuteSqlRawAsync("""
                INSERT INTO snapshot_jobs
                    (path, desired_version, attempts, next_attempt_at, leased_until)
                SELECT {0}, {1}, 0, now(), NULL
                WHERE NOT EXISTS (SELECT 1 FROM page_snapshots WHERE path = {0})
                ON CONFLICT (path) DO NOTHING
                """, new object[] { path, version }, ct);
        }
    }

    private static async Task InsertAsync(
        HotelDbContext db, JsonElement fixture, string fixtureName, string table,
        CancellationToken cancellationToken, Action<JsonObject>? customize = null)
    {
        var rows = fixture.GetProperty(fixtureName).EnumerateArray().Select(element =>
        {
            var row = JsonNode.Parse(element.GetRawText())!.AsObject();
            customize?.Invoke(row);
            return row;
        }).ToArray();
        if (rows.Length == 0)
            return;
        var columns = rows[0].Select(entry => ToSnakeCase(entry.Key)).ToArray();
        var normalized = rows.Select(row =>
        {
            var result = new JsonObject();
            foreach (var (key, value) in row)
                result[ToSnakeCase(key)] = value?.DeepClone();
            return result;
        }).ToArray();
        var columnList = string.Join(", ", columns.Select(name => $"\"{name}\""));
        // Table and columns come exclusively from embedded, version-controlled fixtures.
        var sql = $"INSERT INTO \"{table}\" ({columnList}) SELECT {columnList} " +
            $"FROM jsonb_populate_recordset(NULL::{table}, @rows) ON CONFLICT DO NOTHING";
        await db.Database.ExecuteSqlRawAsync(sql,
            new object[]
            {
                new NpgsqlParameter("rows", NpgsqlDbType.Jsonb)
                    { Value = JsonSerializer.Serialize(normalized) }
            }, cancellationToken);
    }

    private static async Task InsertLinksAsync(HotelDbContext db, string table, string idColumn,
        IReadOnlyList<(string Id, string AmenityId)> links, CancellationToken cancellationToken)
    {
        var rows = links.Select(link => new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [idColumn] = link.Id,
            ["amenity_id"] = link.AmenityId,
        });
        var sql = $"INSERT INTO \"{table}\" (\"{idColumn}\", amenity_id) " +
            $"SELECT \"{idColumn}\", amenity_id FROM " +
            $"jsonb_populate_recordset(NULL::{table}, @rows) ON CONFLICT DO NOTHING";
        await db.Database.ExecuteSqlRawAsync(sql,
            new object[]
            {
                new NpgsqlParameter("rows", NpgsqlDbType.Jsonb)
                    { Value = JsonSerializer.Serialize(rows) }
            }, cancellationToken);
    }

    private static string ToSnakeCase(string name)
    {
        var result = new System.Text.StringBuilder(name.Length + 4);
        foreach (var character in name)
        {
            if (char.IsUpper(character) && result.Length > 0)
                result.Append('_');
            result.Append(char.ToLowerInvariant(character));
        }
        return result.ToString();
    }
}
