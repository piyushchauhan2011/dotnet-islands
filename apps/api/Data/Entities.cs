using System.Text.Json;

namespace Hotel.Api.Data;

public sealed class Destination
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Country { get; set; } = "";
    public string Eyebrow { get; set; } = "Destination";
    public string Summary { get; set; } = "";
    public JsonDocument Content { get; set; } = null!;
    public string HeroImage { get; set; } = "";
    public string SeoTitle { get; set; } = "";
    public string SeoDescription { get; set; } = "";
    public string Status { get; set; } = "draft";
    public DateTime? PublishedAt
    {
        get; set;
    }
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class Hotel
{
    public string Id { get; set; } = "";
    public string DestinationId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string PropertyType { get; set; } = "Boutique hotel";
    public string Address { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Description { get; set; } = "";
    public string HeroImage { get; set; } = "";
    public double Rating
    {
        get; set;
    }
    public int? StarRating
    {
        get; set;
    }
    public int ReviewCount
    {
        get; set;
    }
    public int PriceFrom
    {
        get; set;
    }
    public string Currency { get; set; } = "USD";
    public double? Latitude
    {
        get; set;
    }
    public double? Longitude
    {
        get; set;
    }
    public string SeoTitle { get; set; } = "";
    public string SeoDescription { get; set; } = "";
    public string Status { get; set; } = "draft";
    public DateTime? PublishedAt
    {
        get; set;
    }
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class Room
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Image { get; set; } = "";
    public int PriceFrom
    {
        get; set;
    }
    public int MaxGuests
    {
        get; set;
    }
    public int? SizeSqm
    {
        get; set;
    }
    public string Bed { get; set; } = "";
    public string Status { get; set; } = "draft";
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class Offer
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Image { get; set; } = "";
    public int? DiscountPercent
    {
        get; set;
    }
    public string? ValidFrom
    {
        get; set;
    }
    public string? ValidTo
    {
        get; set;
    }
    public string Terms { get; set; } = "";
    public string Status { get; set; } = "draft";
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class Amenity
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "sparkles";
    public string AppliesTo { get; set; } = "both";
    public string Category { get; set; } = "services";
}

public sealed class HotelAmenity
{
    public string HotelId { get; set; } = "";
    public string AmenityId { get; set; } = "";
}

public sealed class RoomAmenity
{
    public string RoomId { get; set; } = "";
    public string AmenityId { get; set; } = "";
}

public sealed class HotelGalleryImage
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string? RoomId
    {
        get; set;
    }
    public string Src { get; set; } = "";
    public string Alt { get; set; } = "";
    public string? Caption
    {
        get; set;
    }
    public string Category { get; set; } = "";
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelHighlight
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Icon { get; set; } = "";
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelFact
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Group { get; set; } = "";
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelFaq
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelNearbyPlace
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public int DistanceMeters
    {
        get; set;
    }
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelPolicy
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string Category { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelReviewScore
{
    public string HotelId { get; set; } = "";
    public string Category { get; set; } = "";
    public string Label { get; set; } = "";
    public double Score
    {
        get; set;
    }
    public int SortOrder
    {
        get; set;
    }
}

public sealed class HotelReview
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string? RoomId
    {
        get; set;
    }
    public string GuestName { get; set; } = "";
    public string GuestCountry { get; set; } = "";
    public string TravelerType { get; set; } = "";
    public double Rating
    {
        get; set;
    }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string StayedAt { get; set; } = "";
    public string ReviewedAt { get; set; } = "";
    public int Nights
    {
        get; set;
    }
    public string? Response
    {
        get; set;
    }
    public int SortOrder
    {
        get; set;
    }
}

public sealed class MediaAsset
{
    public string Id { get; set; } = "";
    public string Filename { get; set; } = "";
    public string MimeType { get; set; } = "";
    public int Width
    {
        get; set;
    }
    public int Height
    {
        get; set;
    }
    public string Alt { get; set; } = "";
    public string? Caption
    {
        get; set;
    }
    public double FocalX { get; set; } = 0.5;
    public double FocalY { get; set; } = 0.5;
    public JsonDocument Variants { get; set; } = null!;
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class BlogPost
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Excerpt { get; set; } = "";
    public string Author { get; set; } = "";
    public string HeroImage { get; set; } = "";
    public JsonDocument Content { get; set; } = null!;
    public string SeoTitle { get; set; } = "";
    public string SeoDescription { get; set; } = "";
    public string Status { get; set; } = "draft";
    public DateTime? PublishedAt
    {
        get; set;
    }
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class Inquiry
{
    public string Id { get; set; } = "";
    public string HotelId { get; set; } = "";
    public string? RoomId
    {
        get; set;
    }
    public string? OfferId
    {
        get; set;
    }
    public string CheckIn { get; set; } = "";
    public string CheckOut { get; set; } = "";
    public int Adults
    {
        get; set;
    }
    public int Children
    {
        get; set;
    }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Phone
    {
        get; set;
    }
    public string? Message
    {
        get; set;
    }
    public string Status { get; set; } = "new";
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class AdminUser
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTime CreatedAt
    {
        get; set;
    }
    public DateTime UpdatedAt
    {
        get; set;
    }
}

public sealed class PageSnapshot
{
    public string Path { get; set; } = "";
    public string Html { get; set; } = "";
    public string AssetVersion { get; set; } = "";
    public DateTime GeneratedAt
    {
        get; set;
    }
}

public sealed class SnapshotJob
{
    public string Path { get; set; } = "";
    public string DesiredVersion { get; set; } = "";
    public int Attempts
    {
        get; set;
    }
    public DateTime NextAttemptAt
    {
        get; set;
    }
    public DateTime? LeasedUntil
    {
        get; set;
    }
}
