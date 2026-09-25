using System.Text.Json;
using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Hotel.Api.Admin;

internal static class AdminContent
{
    private static readonly Dictionary<string, string> Singular = new(StringComparer.Ordinal)
    {
        ["destinations"] = "destination",
        ["hotels"] = "hotel",
        ["rooms"] = "room",
        ["offers"] = "offer",
        ["posts"] = "post"
    };

    public static async Task<IResult> Save(string kind, HttpContext context, HotelDbContext db)
    {
        if (await AdminApi.AuthError(context, db) is { } unauthorized)
            return unauthorized;
        if (AdminApi.MutationError(context) is { } csrf)
            return csrf;
        if (!Singular.TryGetValue(kind, out var expected))
            return Results.NotFound();
        var (inputError, validation) = await ReadSaveInput(context.Request, expected);
        if (inputError is not null)
            return inputError;
        var checkedInput = validation!;
        var state = new SaveState(db, checkedInput,
            checkedInput.Id ?? Guid.NewGuid().ToString(), checkedInput.Slug,
            checkedInput.Status, DateTime.UtcNow);
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var error = kind switch
            {
                "destinations" => await SaveDestination(state),
                "hotels" => await SaveHotel(state),
                "rooms" => await SaveRoom(state),
                "offers" => await SaveOffer(state),
                _ => await SavePost(state)
            };
            if (error is not null)
                return error;
            await db.SaveChangesAsync();
            await SnapshotInvalidation.Update(db, kind, state.Id, state.OldPath,
                state.PreviousDestinationId, state.PreviousHotelId);
            await transaction.CommitAsync();
            return Results.Ok(new
            {
                ok = true,
                id = state.Id
            });
        }
        catch (AdminInputException ex)
        {
            state.Content?.Dispose();
            return AdminApi.ValidationError(ex.Errors);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg
            && pg.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Results.Conflict(new
            {
                error = "A record with this slug already exists in its catalog scope.",
                field = "slug"
            });
        }
    }

    private static async Task<(IResult? Error, AdminValidation? Validation)> ReadSaveInput(
        HttpRequest request, string expected)
    {
        if (!request.HasJsonContentType())
            return (Results.BadRequest(new
            {
                error = "Expected application/json."
            }), null);
        JsonElement input;
        try
        {
            input = await request.ReadFromJsonAsync<JsonElement>();
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return (Results.BadRequest(new
            {
                error = "Invalid JSON."
            }), null);
        }
        if (input.ValueKind != JsonValueKind.Object)
            return (Results.BadRequest(new
            {
                error = "Content must be an object."
            }), null);
        var validation = new AdminValidation(input);
        if (validation.Kind != expected)
            return (FieldError("kind", $"Expected {expected}."), null);
        return (null, validation);
    }

    private sealed record SaveState(
        HotelDbContext Db, AdminValidation Validation, string Id, string Slug, string Status,
        DateTime Now)
    {
        public string? OldPath
        {
            get; set;
        }
        public string? PreviousDestinationId
        {
            get; set;
        }
        public string? PreviousHotelId
        {
            get; set;
        }
        public JsonDocument? Content
        {
            get; set;
        }
    }

    private static async Task<IResult?> SaveDestination(SaveState state)
    {
        var (db, validation, id, slug, status, now) =
            (state.Db, state.Validation, state.Id, state.Slug, state.Status, state.Now);
        var name = validation.Text("name", 2, 160);
        var country = validation.Text("country", 2, 100);
        var eyebrow = validation.Text("eyebrow", 2, 80);
        var summary = validation.Text("summary", 20, 500);
        state.Content = validation.Content();
        var hero = validation.Image("heroImage");
        var seoTitle = validation.Text("seoTitle", 2, 160);
        var seoDescription = validation.Text("seoDescription", 20, 320);
        validation.Check();
        var entity = await db.Destinations.FirstOrDefaultAsync(x => x.Id == id);
        if (validation.Id is not null && entity is null)
            return Results.NotFound();
        state.OldPath = entity is null ? null : $"/destinations/{entity.Slug}";
        entity ??= new Destination { Id = id, CreatedAt = now };
        entity.Name = name;
        entity.Slug = slug;
        entity.Country = country;
        entity.Eyebrow = eyebrow;
        entity.Summary = summary;
        entity.Content = state.Content;
        entity.HeroImage = hero;
        entity.SeoTitle = seoTitle;
        entity.SeoDescription = seoDescription;
        SetPublication(entity, status, now);
        if (validation.Id is null)
            db.Destinations.Add(entity);
        return null;
    }

    private static async Task<IResult?> SaveHotel(SaveState state)
    {
        var (db, validation, id, slug, status, now) =
            (state.Db, state.Validation, state.Id, state.Slug, state.Status, state.Now);
        var destinationId = validation.Text("destinationId", 1, 200);
        var name = validation.Text("name", 2, 160);
        var propertyType = validation.Text("propertyType", 2, 100);
        var address = validation.Text("address", 3, 240);
        var summary = validation.Text("summary", 20, 500);
        var description = validation.Text("description", 20, 5000);
        var hero = validation.Image("heroImage");
        var rating = validation.Number("rating", 0, 5);
        var price = validation.Integer("priceFrom", 0, int.MaxValue);
        var currency = validation.Text("currency", 3, 3).ToUpperInvariant();
        var latitude = validation.OptionalNumber("latitude", -90, 90);
        var longitude = validation.OptionalNumber("longitude", -180, 180);
        var seoTitle = validation.Text("seoTitle", 2, 160);
        var seoDescription = validation.Text("seoDescription", 20, 320);
        validation.Check();
        if (!await db.Destinations.AnyAsync(x => x.Id == destinationId))
            return FieldError("destinationId", "Destination does not exist.");
        var entity = await db.Hotels.FirstOrDefaultAsync(x => x.Id == id);
        if (validation.Id is not null && entity is null)
            return Results.NotFound();
        state.OldPath = entity is null ? null : $"/hotels/{entity.Slug}";
        state.PreviousDestinationId = entity?.DestinationId;
        entity ??= new Hotel.Api.Data.Hotel { Id = id, CreatedAt = now };
        entity.DestinationId = destinationId;
        entity.Name = name;
        entity.Slug = slug;
        entity.PropertyType = propertyType;
        entity.Address = address;
        entity.Summary = summary;
        entity.Description = description;
        entity.HeroImage = hero;
        ApplyHotelMetadata(entity, rating, price, currency, latitude, longitude,
            seoTitle, seoDescription, status, now);
        if (validation.Id is null)
            db.Hotels.Add(entity);
        return null;
    }

    private static void ApplyHotelMetadata(
        Hotel.Api.Data.Hotel entity, double rating, int price, string currency,
        double? latitude, double? longitude, string seoTitle, string seoDescription,
        string status, DateTime now)
    {
        entity.Rating = rating;
        entity.PriceFrom = price;
        entity.Currency = currency;
        entity.Latitude = latitude;
        entity.Longitude = longitude;
        entity.SeoTitle = seoTitle;
        entity.SeoDescription = seoDescription;
        SetPublication(entity, status, now);
    }

    private static async Task<IResult?> SaveRoom(SaveState state)
    {
        var (db, validation, id, slug, status, now) =
            (state.Db, state.Validation, state.Id, state.Slug, state.Status, state.Now);
        var hotelId = validation.Text("hotelId", 1, 200);
        var name = validation.Text("name", 2, 160);
        var summary = validation.Text("summary", 20, 500);
        var image = validation.Image("image");
        var price = validation.Integer("priceFrom", 0, int.MaxValue);
        var maxGuests = validation.Integer("maxGuests", 1, 30);
        var size = validation.OptionalInteger("sizeSqm", 1, int.MaxValue);
        var bed = validation.Text("bed", 2, 120);
        validation.Check();
        if (!await db.Hotels.AnyAsync(x => x.Id == hotelId))
            return FieldError("hotelId", "Hotel does not exist.");
        var entity = await db.Rooms.FirstOrDefaultAsync(x => x.Id == id);
        if (validation.Id is not null && entity is null)
            return Results.NotFound();
        state.PreviousHotelId = entity?.HotelId;
        entity ??= new Room { Id = id, CreatedAt = now };
        entity.HotelId = hotelId;
        entity.Name = name;
        entity.Slug = slug;
        entity.Summary = summary;
        entity.Image = image;
        entity.PriceFrom = price;
        entity.MaxGuests = maxGuests;
        entity.SizeSqm = size;
        entity.Bed = bed;
        entity.Status = status;
        entity.UpdatedAt = now;
        if (validation.Id is null)
            db.Rooms.Add(entity);
        return null;
    }

    private static async Task<IResult?> SaveOffer(SaveState state)
    {
        var (db, validation, id, slug, status, now) =
            (state.Db, state.Validation, state.Id, state.Slug, state.Status, state.Now);
        var hotelId = validation.Text("hotelId", 1, 200);
        var title = validation.Text("title", 2, 160);
        var summary = validation.Text("summary", 20, 500);
        var image = validation.Image("image");
        var discount = validation.OptionalInteger("discountPercent", 0, 100);
        var validFrom = validation.Date("validFrom");
        var validTo = validation.Date("validTo");
        var terms = validation.Text("terms", 10, 3000);
        validation.Check();
        if (validFrom is not null && validTo is not null
            && string.CompareOrdinal(validTo, validFrom) < 0)
            return FieldError("validTo", "Must be on or after the start date.");
        if (!await db.Hotels.AnyAsync(x => x.Id == hotelId))
            return FieldError("hotelId", "Hotel does not exist.");
        var entity = await db.Offers.FirstOrDefaultAsync(x => x.Id == id);
        if (validation.Id is not null && entity is null)
            return Results.NotFound();
        if (entity is not null)
        {
            var oldHotelSlug = await db.Hotels.Where(x => x.Id == entity.HotelId)
                .Select(x => x.Slug).FirstAsync();
            state.OldPath = $"/hotels/{oldHotelSlug}/offers/{entity.Slug}";
        }
        state.PreviousHotelId = entity?.HotelId;
        entity ??= new Offer { Id = id, CreatedAt = now };
        entity.HotelId = hotelId;
        entity.Title = title;
        entity.Slug = slug;
        entity.Summary = summary;
        entity.Image = image;
        entity.DiscountPercent = discount;
        entity.ValidFrom = validFrom;
        entity.ValidTo = validTo;
        entity.Terms = terms;
        entity.Status = status;
        entity.UpdatedAt = now;
        if (validation.Id is null)
            db.Offers.Add(entity);
        return null;
    }

    private static async Task<IResult?> SavePost(SaveState state)
    {
        var (db, validation, id, slug, status, now) =
            (state.Db, state.Validation, state.Id, state.Slug, state.Status, state.Now);
        var title = validation.Text("title", 2, 160);
        var excerpt = validation.Text("excerpt", 20, 500);
        var author = validation.Text("author", 2, 120);
        var hero = validation.Image("heroImage");
        state.Content = validation.Content();
        var seoTitle = validation.Text("seoTitle", 2, 160);
        var seoDescription = validation.Text("seoDescription", 20, 320);
        validation.Check();
        if (status == "published" && await InvalidEmbeds(db, state.Content) is { } embedError)
            return FieldError("content", embedError);
        var entity = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id);
        if (validation.Id is not null && entity is null)
            return Results.NotFound();
        state.OldPath = entity is null ? null : $"/blog/{entity.Slug}";
        entity ??= new BlogPost { Id = id, CreatedAt = now };
        entity.Title = title;
        entity.Slug = slug;
        entity.Excerpt = excerpt;
        entity.Author = author;
        entity.HeroImage = hero;
        entity.Content = state.Content;
        entity.SeoTitle = seoTitle;
        entity.SeoDescription = seoDescription;
        SetPublication(entity, status, now);
        if (validation.Id is null)
            db.BlogPosts.Add(entity);
        return null;
    }

    private static IResult FieldError(string field, string message) =>
        AdminApi.ValidationError(new Dictionary<string, string> { [field] = message });

    public static async Task<IResult> Publish(
        string kind, string id, HttpContext context, HotelDbContext db)
    {
        if (await AdminApi.AuthError(context, db) is { } unauthorized)
            return unauthorized;
        if (AdminApi.MutationError(context) is { } csrf)
            return csrf;
        if (!Singular.ContainsKey(kind))
            return Results.NotFound();
        if (!context.Request.HasJsonContentType())
            return Results.BadRequest(new
            {
                error = "Expected application/json."
            });
        JsonElement input;
        try
        {
            input = await context.Request.ReadFromJsonAsync<JsonElement>();
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return Results.BadRequest(new
            {
                error = "Invalid JSON."
            });
        }
        var validation = new AdminValidation(input);
        var status = validation.Enum("status", "draft", "published");
        if (validation.Errors.Count > 0)
            return AdminApi.ValidationError(validation.Errors);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var (error, oldPath, destinationId, hotelId) =
            await ApplyPublication(kind, id, status, db, DateTime.UtcNow);
        if (error is not null)
            return error;
        await db.SaveChangesAsync();
        await SnapshotInvalidation.Update(db, kind, id, oldPath, destinationId, hotelId);
        await transaction.CommitAsync();
        return Results.Ok(new
        {
            ok = true
        });
    }

    private static async Task<(IResult? Error, string? OldPath, string? DestinationId,
        string? HotelId)> ApplyPublication(
        string kind, string id, string status, HotelDbContext db, DateTime now)
    {
        string? oldPath = null;
        string? destinationId = null;
        string? hotelId = null;
        switch (kind)
        {
            case "destinations":
                var destination = await db.Destinations.FirstOrDefaultAsync(x => x.Id == id);
                if (destination is null)
                    return (Results.NotFound(), null, null, null);
                oldPath = $"/destinations/{destination.Slug}";
                SetPublication(destination, status, now);
                break;
            case "hotels":
                var hotel = await db.Hotels.FirstOrDefaultAsync(x => x.Id == id);
                if (hotel is null)
                    return (Results.NotFound(), null, null, null);
                oldPath = $"/hotels/{hotel.Slug}";
                destinationId = hotel.DestinationId;
                SetPublication(hotel, status, now);
                break;
            case "rooms":
                var room = await db.Rooms.FirstOrDefaultAsync(x => x.Id == id);
                if (room is null)
                    return (Results.NotFound(), null, null, null);
                room.Status = status;
                room.UpdatedAt = now;
                hotelId = room.HotelId;
                break;
            case "offers":
                var offer = await db.Offers.FirstOrDefaultAsync(x => x.Id == id);
                if (offer is null)
                    return (Results.NotFound(), null, null, null);
                var slug = await db.Hotels.Where(x => x.Id == offer.HotelId)
                    .Select(x => x.Slug).FirstAsync();
                oldPath = $"/hotels/{slug}/offers/{offer.Slug}";
                offer.Status = status;
                offer.UpdatedAt = now;
                hotelId = offer.HotelId;
                break;
            case "posts":
                return await ApplyPostPublication(db, id, status, now);
        }
        return (null, oldPath, destinationId, hotelId);
    }
    private static async Task<(IResult? Error, string? OldPath, string? DestinationId,
        string? HotelId)> ApplyPostPublication(
        HotelDbContext db, string id, string status, DateTime now)
    {
        var post = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id);
        if (post is null)
            return (Results.NotFound(), null, null, null);
        if (status == "published"
            && await InvalidEmbeds(db, post.Content) is { } embedError)
            return (FieldError("content", embedError), null, null, null);
        var oldPath = $"/blog/{post.Slug}";
        SetPublication(post, status, now);
        return (null, oldPath, null, null);
    }


    private static void SetPublication(Destination x, string status, DateTime now)
    {
        x.Status = status;
        x.PublishedAt = status == "published" ? x.PublishedAt ?? now : null;
        x.UpdatedAt = now;
    }
    private static void SetPublication(Hotel.Api.Data.Hotel x, string status, DateTime now)
    {
        x.Status = status;
        x.PublishedAt = status == "published" ? x.PublishedAt ?? now : null;
        x.UpdatedAt = now;
    }
    private static void SetPublication(BlogPost x, string status, DateTime now)
    {
        x.Status = status;
        x.PublishedAt = status == "published" ? x.PublishedAt ?? now : null;
        x.UpdatedAt = now;
    }

    private static async Task<string?> InvalidEmbeds(HotelDbContext db, JsonDocument content)
    {
        foreach (var node in content.RootElement.EnumerateArray())
        {
            if (!node.TryGetProperty("entityId", out var value)
                || value.ValueKind != JsonValueKind.String)
                continue;
            var id = value.GetString()!;
            if (!node.TryGetProperty("type", out var type))
                continue;
            if (!await IsVisibleEmbed(db, type.GetString(), id))
                return $"Embedded {type.GetString()} {id} is not published.";
        }
        return null;
    }

    private static Task<bool> IsVisibleEmbed(HotelDbContext db, string? type, string id) =>
        type switch
        {
            "destinationEmbed" => db.Destinations.AnyAsync(
                x => x.Id == id && x.Status == "published"),
            "hotelEmbed" => (from hotel in db.Hotels
                             join destination in db.Destinations
                                 on hotel.DestinationId equals destination.Id
                             where hotel.Id == id && hotel.Status == "published"
                                 && destination.Status == "published"
                             select hotel.Id).AnyAsync(),
            "roomEmbed" => (from room in db.Rooms
                            join hotel in db.Hotels on room.HotelId equals hotel.Id
                            join destination in db.Destinations
                                on hotel.DestinationId equals destination.Id
                            where room.Id == id && room.Status == "published"
                                && hotel.Status == "published"
                                && destination.Status == "published"
                            select room.Id).AnyAsync(),
            "offerEmbed" => (from offer in db.Offers
                             join hotel in db.Hotels on offer.HotelId equals hotel.Id
                             join destination in db.Destinations
                                 on hotel.DestinationId equals destination.Id
                             where offer.Id == id && offer.Status == "published"
                                 && hotel.Status == "published"
                                 && destination.Status == "published"
                             select offer.Id).AnyAsync(),
            _ => Task.FromResult(true)
        };
}
