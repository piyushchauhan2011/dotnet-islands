using CatalogHotel = global::Hotel.Api.Data.Hotel;
using System.Text.Encodings.Web;
using System.Text.Json;
using Hotel.Api.Data;
using Hotel.Api.Public;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Hotel.Api.Pages;

public abstract class PublicPageModel(CatalogPageService catalog) : PageModel
{
    protected CatalogPageService Catalog => catalog;
    public string SeoTitle
    {
        get; protected set;
    } =
        "Elsewhere — remarkable hotels, thoughtfully found";
    public string SeoDescription
    {
        get; protected set;
    } =
        "Independent hotels, destination guides, and slower journeys selected with care.";
    public string CanonicalPath { get; protected set; } = "/";
    public string Robots { get; protected set; } = "index,follow";
    public string? JsonLd
    {
        get; protected set;
    }
    public bool HeaderOverlay
    {
        get; protected set;
    }
    public static string IslandProps(object props) =>
        JsonSerializer.Serialize(props, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    protected void StructuredData(object data) => JsonLd = JsonSerializer.Serialize(data,
        new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            Encoder = JavaScriptEncoder.Default
        });
    public static string HotelLink(CatalogHotel hotel) =>
        "/hotels/" + Uri.EscapeDataString(hotel.Slug);
    public static string DestinationLink(Destination destination) =>
        "/destinations/" + Uri.EscapeDataString(destination.Slug);
    public static string BlogLink(BlogPost post) =>
        "/blog/" + Uri.EscapeDataString(post.Slug);
    public static string OfferLink(CatalogHotel hotel, Offer offer) =>
        HotelLink(hotel) + "/offers/" + Uri.EscapeDataString(offer.Slug);
    public static string Price(int amount, string currency)
    {
        try
        {
            var culture = currency == "EUR" ? "fr-FR" : currency == "GBP" ? "en-GB" : "en-US";
            return amount.ToString("C0", System.Globalization.CultureInfo.GetCultureInfo(culture));
        }
        catch (System.Globalization.CultureNotFoundException)
        {
            return amount.ToString(System.Globalization.CultureInfo.InvariantCulture) + " " +
                currency;
        }
    }
}

public sealed class HomeModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public HomeCatalog Data { get; private set; } = null!;
    public async Task OnGet(CancellationToken ct)
    {
        Data = await Catalog.Home(ct);
        HeaderOverlay = true;
    }
}

public sealed class DestinationsModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public List<Destination> Items { get; private set; } = [];
    public async Task OnGet(CancellationToken ct)
    {
        CanonicalPath = "/destinations";
        SeoTitle = "Destinations — Elsewhere";
        SeoDescription = "Travel guides and independent hotels in places worth knowing slowly.";
        Items = await Catalog.Destinations(ct);
    }
}

public sealed class DestinationModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public DestinationCatalog Data { get; private set; } = null!;
    public async Task<IActionResult> OnGet(string slug, CancellationToken ct)
    {
        var data = await Catalog.Destination(slug, ct);
        if (data is null)
            return NotFound();
        Data = data;
        HeaderOverlay = true;
        CanonicalPath = DestinationLink(data.Destination);
        SeoTitle = data.Destination.SeoTitle;
        SeoDescription = data.Destination.SeoDescription;
        return Page();
    }
}

public sealed class HotelModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public HotelCatalog Data { get; private set; } = null!;
    public async Task<IActionResult> OnGet(string slug, CancellationToken ct)
    {
        var data = await Catalog.Hotel(slug, ct);
        if (data is null)
            return NotFound();
        Data = data;
        CanonicalPath = HotelLink(data.Hotel);
        SeoTitle = data.Hotel.SeoTitle;
        SeoDescription = data.Hotel.SeoDescription;
        StructuredData(new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "Hotel",
            ["name"] = data.Hotel.Name,
            ["description"] = data.Hotel.Summary,
            ["image"] = data.Hotel.HeroImage,
            ["address"] = data.Hotel.Address,
            ["starRating"] = data.Hotel.StarRating is null ? null :
                new
                {
                    @type = "Rating",
                    ratingValue = data.Hotel.StarRating
                },
            ["aggregateRating"] = data.Hotel.ReviewCount == 0 ? null :
                new
                {
                    @type = "AggregateRating",
                    ratingValue = data.Hotel.Rating,
                    reviewCount = data.Hotel.ReviewCount
                }
        });
        return Page();
    }
}

public sealed class OfferModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public OfferCatalog Data { get; private set; } = null!;
    public async Task<IActionResult> OnGet(string slug, string offerSlug, CancellationToken ct)
    {
        var data = await Catalog.Offer(slug, offerSlug, ct);
        if (data is null)
            return NotFound();
        Data = data;
        CanonicalPath = OfferLink(data.Hotel, data.Offer);
        SeoTitle = $"{data.Offer.Title} at {data.Hotel.Name} — Elsewhere";
        SeoDescription = data.Offer.Summary;
        return Page();
    }
}

public sealed class BlogModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public List<BlogPost> Posts { get; private set; } = [];
    public async Task OnGet(CancellationToken ct)
    {
        CanonicalPath = "/blog";
        SeoTitle = "The Journal — Elsewhere";
        SeoDescription = "Field notes, hotel stories, and thoughtful guides for going well.";
        Posts = await Catalog.Posts(ct);
    }
}

public sealed class PostModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public PostCatalog Data { get; private set; } = null!;
    public async Task<IActionResult> OnGet(string slug, CancellationToken ct)
    {
        var data = await Catalog.Post(slug, ct);
        if (data is null)
            return NotFound();
        Data = data;
        CanonicalPath = BlogLink(data.Post);
        SeoTitle = data.Post.SeoTitle;
        SeoDescription = data.Post.SeoDescription;
        StructuredData(new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "BlogPosting",
            ["headline"] = data.Post.Title,
            ["description"] = data.Post.Excerpt,
            ["author"] = new { @type = "Person", name = data.Post.Author },
            ["image"] = data.Post.HeroImage,
            ["datePublished"] = data.Post.PublishedAt?.ToString("O")
        });
        return Page();
    }
}

public sealed class SearchModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public SearchCatalog Data { get; private set; } = null!;
    public List<Destination> Destinations { get; private set; } = [];
    public async Task OnGet(CancellationToken ct)
    {
        CanonicalPath = "/search";
        SeoTitle = "Find a hotel — Elsewhere";
        SeoDescription =
            "Search independent hotels by destination, price, rating, amenities, and offers.";
        if (Request.Query.Count > 0)
            Robots = "noindex,follow";
        Data = await Catalog.Search(Request.Query, ct);
        Destinations = await Catalog.Destinations(ct);
    }
    public string PageLink(int page)
    {
        var query = new List<KeyValuePair<string, string?>>();
        foreach (var item in Request.Query)
        {
            if (item.Key == "page")
                continue;
            foreach (var value in item.Value)
                query.Add(new(item.Key, value));
        }
        query.Add(new("page", page.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        return "/search" + Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString("", query);
    }
}

public sealed class InquireModel(CatalogPageService catalog) : PublicPageModel(catalog)
{
    public InquiryCatalog Data { get; private set; } = null!;
    public async Task<IActionResult> OnGet(
        string? hotel, string? room, string? offer, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(hotel))
            return NotFound();
        var data = await Catalog.Inquiry(hotel, room, offer, ct);
        if (data is null)
            return NotFound();
        Data = data;
        CanonicalPath = "/inquire";
        SeoTitle = "Make an inquiry — Elsewhere";
        SeoDescription =
            "Ask about a stay at " + data.Hotel.Name + ". No reservation or payment is made.";
        Robots = "noindex,nofollow";
        Response.Headers.CacheControl = "private,no-store";
        return Page();
    }
}
public sealed record SearchFormView(
    IReadOnlyList<Destination> Destinations, SearchFilters? Initial = null, bool Compact = false);
public sealed record RichView(
    JsonDocument Content, IReadOnlyDictionary<string, CatalogHotel>? Hotels = null);
