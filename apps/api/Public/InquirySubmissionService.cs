using System.Globalization;
using System.Net.Mail;
using System.Text.Json;
using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Public;

public sealed class InquirySubmissionService(HotelDbContext db, CatalogPageService catalog)
{
    public async Task<InquirySubmissionResult> SubmitAsync(
        JsonElement payload, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var input = ParseInput(payload, errors);
        if (errors.Count != 0)
            return new(null, errors);

        await ValidateAvailability(input, errors, ct);
        if (errors.Count != 0)
            return new(null, errors);

        var id = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;
        db.Inquiries.Add(new Inquiry
        {
            Id = id,
            HotelId = input.HotelId!,
            RoomId = input.RoomId,
            OfferId = input.OfferId,
            CheckIn = input.CheckIn!,
            CheckOut = input.CheckOut!,
            Adults = input.Adults,
            Children = input.Children,
            Name = input.Name!,
            Email = input.Email!,
            Phone = input.Phone,
            Message = input.Message,
            Status = "new",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync(ct);
        return new(id, errors);
    }

    private sealed record InquiryInput(
        string? HotelId, string? RoomId, string? OfferId, string? CheckIn, string? CheckOut,
        int Adults, int Children, string? Name, string? Email, string? Phone, string? Message);

    private static InquiryInput ParseInput(
        JsonElement input, Dictionary<string, string[]> errors)
    {
        var hotelId = Field(input, errors, "hotelId", 1, 160);
        var roomId = Field(input, errors, "roomId", 0, 160, false);
        var offerId = Field(input, errors, "offerId", 0, 160, false);
        var checkIn = Date(input, errors, "checkIn");
        var checkOut = Date(input, errors, "checkOut");
        var adults = Party(input, errors, "adults", 1, 12);
        var children = Party(input, errors, "children", 0, 8, 0);
        var name = Field(input, errors, "name", 2, 100);
        var email = Field(input, errors, "email", 1, 160);
        var phone = Field(input, errors, "phone", 0, 40, false);
        var message = Field(input, errors, "message", 0, 1200, false);
        var website = Field(input, errors, "website", 0, 0, false);
        if (website is not null)
            errors["website"] = ["Must be empty"];
        if (email is not null && (!MailAddress.TryCreate(email, out var parsed) ||
            parsed.Address != email || !parsed.Host.Contains('.')))
            errors["email"] = ["Enter a valid email address"];
        if (checkIn is not null && checkOut is not null &&
            string.CompareOrdinal(checkOut, checkIn) <= 0)
            errors["checkOut"] = ["Check-out must be after check-in"];
        return new(hotelId, roomId, offerId, checkIn, checkOut,
            adults, children, name, email, phone, message);
    }

    private static string? Field(
        JsonElement input, Dictionary<string, string[]> errors,
        string key, int min, int max, bool required = true)
    {
        if (!input.TryGetProperty(key, out var item) || item.ValueKind == JsonValueKind.Null)
        {
            if (required)
                errors[key] = ["Required"];
            return null;
        }
        if (item.ValueKind != JsonValueKind.String)
        {
            errors[key] = ["Must be a string"];
            return null;
        }
        var value = item.GetString()!.Trim();
        if (value.Length < min || value.Length > max)
            errors[key] = [$"Must be between {min} and {max} characters"];
        return value.Length == 0 && !required ? null : value;
    }

    private static int Party(
        JsonElement input, Dictionary<string, string[]> errors,
        string key, int min, int max, int? defaultValue = null)
    {
        if (!input.TryGetProperty(key, out var item) || item.ValueKind == JsonValueKind.Null)
        {
            if (defaultValue is null)
                errors[key] = ["Required"];
            return defaultValue ?? 0;
        }
        var n = 0;
        var valid = item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out n);
        if (!valid && item.ValueKind == JsonValueKind.String)
            valid = int.TryParse(item.GetString(), NumberStyles.Integer,
                CultureInfo.InvariantCulture, out n);
        if (!valid || n < min || n > max)
            errors[key] = [$"Must be an integer between {min} and {max}"];
        return valid ? n : 0;
    }

    private static string? Date(
        JsonElement input, Dictionary<string, string[]> errors, string key)
    {
        var date = Field(input, errors, key, 10, 10);
        if (date is not null && !DateOnly.TryParseExact(date, "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            errors[key] = ["Must be a valid YYYY-MM-DD date"];
        return date;
    }

    private async Task ValidateAvailability(
        InquiryInput input, Dictionary<string, string[]> errors, CancellationToken ct)
    {
        if (!await catalog.VisibleHotels.AnyAsync(h => h.Id == input.HotelId, ct))
            errors["hotelId"] = ["Hotel is not available for inquiries"];
        if (input.RoomId is not null && !await db.Rooms.AsNoTracking().AnyAsync(r =>
            r.Id == input.RoomId && r.HotelId == input.HotelId && r.Status == "published", ct))
            errors["roomId"] = ["Room is not available at this hotel"];
        if (input.OfferId is not null && !await db.Offers.AsNoTracking().AnyAsync(o =>
            o.Id == input.OfferId && o.HotelId == input.HotelId && o.Status == "published", ct))
            errors["offerId"] = ["Offer is not available at this hotel"];
    }
}

public sealed record InquirySubmissionResult(
    string? Id, IReadOnlyDictionary<string, string[]> FieldErrors);
