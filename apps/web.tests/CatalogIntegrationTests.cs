using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Hotel.Api.Tests;


public sealed class CatalogIntegrationTests(IsolatedCatalog app) : IClassFixture<IsolatedCatalog>
{
    [Fact]
    public async Task PublicCatalogKeepsProjectedHomeHotelAndPostShapes()
    {
        using var home = await app.Client.GetFromJsonAsync<JsonDocument>("/api/home");
        var root = home!.RootElement;
        Assert.True(root.GetProperty("destinations").GetArrayLength() > 0);
        Assert.True(root.GetProperty("hotels").GetArrayLength() > 0);
        var offer = root.GetProperty("offers").EnumerateArray().First();
        Assert.Equal(JsonValueKind.String, offer.GetProperty("hotelSlug").ValueKind);
        Assert.True(offer.TryGetProperty("title", out _));
        Assert.False(offer.TryGetProperty("offer", out _));
        Assert.True(root.GetProperty("posts").GetArrayLength() > 0);

        using var hotel = await app.Client.GetFromJsonAsync<JsonDocument>(
            "/api/hotels/casa-aurelia");
        var detail = hotel!.RootElement;
        Assert.Equal("casa-aurelia",
            detail.GetProperty("hotel").GetProperty("slug").GetString());
        var room = detail.GetProperty("rooms").EnumerateArray().First();
        var amenity = room.GetProperty("amenities").EnumerateArray().First();
        Assert.Equal(room.GetProperty("id").GetString(), amenity.GetProperty("roomId").GetString());
        Assert.False(string.IsNullOrEmpty(amenity.GetProperty("id").GetString()));
        Assert.False(string.IsNullOrEmpty(amenity.GetProperty("name").GetString()));
        var gallery = detail.GetProperty("gallery").EnumerateArray().First();
        Assert.True(gallery.TryGetProperty("sortOrder", out _));

        using var post = await app.Client.GetFromJsonAsync<JsonDocument>(
            "/api/posts/kyoto-considered-weekend-2");
        Assert.Equal("kyoto-considered-weekend-2",
            post!.RootElement.GetProperty("post").GetProperty("slug").GetString());
        Assert.Contains(post.RootElement.GetProperty("embeddedHotels").EnumerateArray(),
            entry => entry.GetProperty("id").GetString() == "hotel-1-1");
    }

    [Fact]
    public async Task AdminMvcRejectsAnonymousInvalidKindsAndMalformedBodies()
    {
        using var anonymous = await app.Client.GetAsync("/api/admin/me");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Contains("private", anonymous.Headers.CacheControl!.ToString());
        Assert.Contains("no-store", anonymous.Headers.CacheControl.ToString());

        var session = await SignInAsAdmin();
        using var client = session.Client;
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/api/admin/not-a-kind")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/api/admin/hotels/does-not-exist")).StatusCode);
        using var editor = await client.GetFromJsonAsync<JsonDocument>("/api/admin/hotels/new");
        Assert.Equal(JsonValueKind.Null, editor!.RootElement.GetProperty("record").ValueKind);
        Assert.True(editor.RootElement.GetProperty("pickers")
            .GetProperty("destinations").GetArrayLength() > 0);
        using var malformed = new HttpRequestMessage(HttpMethod.Post, "/api/admin/hotels")
        {
            Content = new StringContent("{", Encoding.UTF8, "application/json")
        };
        malformed.Headers.Add("X-CSRF-Token", session.Token);
        using var response = await client.SendAsync(malformed);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var error = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid JSON.", error.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task SearchFiltersPublishedHotels()
    {
        var response = await app.Client.GetAsync(
            "/api/search?destination=amalfi-coast&maxPrice=220");
        response.EnsureSuccessStatusCode();
        using (var catalog = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
        {
            var hotels = catalog.RootElement.GetProperty("results").EnumerateArray().ToArray();
            Assert.Single(hotels);
            Assert.Equal("Casa Aurelia", hotels[0].GetProperty("name").GetString());
            Assert.Equal(
                "amalfi-coast",
                hotels[0].GetProperty("destination").GetProperty("slug").GetString());
        }
    }

    [Fact]
    public async Task InquiryRejectsCrossHotelLinksAndAcceptsMatchingRoom()
    {
        var today = DateTime.UtcNow.AddDays(5);
        var inquiry = new
        {
            hotelId = "hotel-1-1",
            roomId = "hotel-2-1-room-1",
            checkIn = today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            checkOut = today.AddDays(3).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            adults = 2,
            children = 0,
            name = "Isolated Guest",
            email = "isolated@example.com",
            website = ""
        };
        var forbidden = await app.Client.PostAsJsonAsync("/api/inquiries", inquiry);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        var csrf = await app.Client.GetFromJsonAsync<JsonElement>("/api/csrf");
        var token = csrf.GetProperty("csrfToken").GetString()!;
        using var invalid = new HttpRequestMessage(HttpMethod.Post, "/api/inquiries")
        {
            Content = JsonContent.Create(inquiry)
        };
        invalid.Headers.Add("X-CSRF-Token", token);
        var rejected = await app.Client.SendAsync(invalid);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("roomId", await rejected.Content.ReadAsStringAsync());
        using var valid = new HttpRequestMessage(HttpMethod.Post, "/api/inquiries")
        {
            Content = JsonContent.Create(new
            {
                inquiry.hotelId,
                roomId = "hotel-1-1-room-1",
                inquiry.checkIn,
                inquiry.checkOut,
                inquiry.adults,
                inquiry.children,
                inquiry.name,
                inquiry.email,
                inquiry.website
            })
        };
        valid.Headers.Add("X-CSRF-Token", token);
        var accepted = await app.Client.SendAsync(valid);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        using var receipt = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync());
        Assert.Equal(8, receipt.RootElement.GetProperty("reference").GetString()!.Length);
        Assert.Contains(
            "not a reservation",
            receipt.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task CmsMutationAtomicallyInvalidatesAndUnpublishesArticle()
    {
        var path = "/blog/the-art-of-the-unhurried-arrival";
        var before = await app.JobVersion(path);
        Assert.NotNull(before);
        var session = await SignInAsAdmin();
        using var client = session.Client;
        var token = session.Token;
        var forbidden = await client.PostAsJsonAsync(
            "/api/admin/posts/post-1/publish",
            new
            {
                status = "draft"
            });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        await SaveArticle(client, token);
        Assert.NotEqual(before, await app.JobVersion(path), StringComparer.Ordinal);
        using var live = JsonDocument.Parse(
            await client.GetStringAsync("/api/posts/the-art-of-the-unhurried-arrival"));
        Assert.Equal(
            "Updated from isolated CMS",
            live.RootElement.GetProperty("post").GetProperty("seoTitle").GetString());
        using var unpublish = new HttpRequestMessage(
            HttpMethod.Post,
            "/api/admin/posts/post-1/publish")
        {
            Content = JsonContent.Create(new { status = "draft" })
        };
        unpublish.Headers.Add("X-CSRF-Token", token);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(unpublish)).StatusCode);
        Assert.Null(await app.JobVersion(path));
        Assert.Equal(HttpStatusCode.NotFound, (await app.Client.GetAsync(path)).StatusCode);
        Assert.DoesNotContain(path, await app.Client.GetStringAsync("/sitemap.xml"));
    }

    [Fact]
    public async Task UploadedMediaServesGeneratedVariantsAndAppearsInLibrary()
    {
        var session = await SignInAsAdmin();
        using var client = session.Client;
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(await File.ReadAllBytesAsync(app.ReferenceImagePath));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/webp");
        form.Add(file, "file", "hero-1280.webp");
        form.Add(new StringContent("Coastline at sunset"), "alt");
        form.Add(new StringContent("An evening view"), "caption");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/admin/media")
        {
            Content = form
        };
        request.Headers.Add("X-CSRF-Token", session.Token);
        using var upload = await client.SendAsync(request);
        upload.EnsureSuccessStatusCode();
        using var payload = JsonDocument.Parse(await upload.Content.ReadAsStringAsync());
        var id = payload.RootElement.GetProperty("id").GetString();
        var variants = payload.RootElement.GetProperty("variants");
        foreach (var name in new[] { "thumbnail", "large" })
        {
            var url = variants.GetProperty(name).GetString();
            Assert.Equal($"/media/{id}/{name}", url);
            using var response = await client.GetAsync(url);
            Assert.True(response.IsSuccessStatusCode,
                response.IsSuccessStatusCode ? "" : await response.Content.ReadAsStringAsync());
            Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
            var image = await response.Content.ReadAsByteArrayAsync();
            Assert.Equal("RIFF", Encoding.ASCII.GetString(image, 0, 4));
            Assert.Equal("WEBP", Encoding.ASCII.GetString(image, 8, 4));
        }
        var dashboard = await client.GetFromJsonAsync<JsonElement>("/api/admin/dashboard");
        var uploaded = dashboard.GetProperty("media").EnumerateArray()
            .Single(asset => asset.GetProperty("id").GetString() == id);
        Assert.Equal("Coastline at sunset", uploaded.GetProperty("alt").GetString());
    }

    private async Task<(HttpClient Client, string Token)> SignInAsAdmin()
    {
        var client = new HttpClient(
            new HttpClientHandler { CookieContainer = new CookieContainer() })
        {
            BaseAddress = app.Origin
        };
        try
        {
            var unauthorized = await client.GetAsync("/api/admin/dashboard");
            Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
            var csrf = await client.GetFromJsonAsync<JsonElement>("/api/csrf");
            var token = csrf.GetProperty("csrfToken").GetString()!;
            using var login = new HttpRequestMessage(HttpMethod.Post, "/api/admin/login")
            {
                Content = JsonContent.Create(new
                {
                    email = "isolated-admin@example.com",
                    password = app.AdminPassword
                })
            };
            login.Headers.Add("X-CSRF-Token", token);
            using var response = await client.SendAsync(login);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return (client, token);
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    private static async Task SaveArticle(HttpClient client, string token)
    {
        using var details = JsonDocument.Parse(
            await client.GetStringAsync("/api/admin/posts/post-1"));
        var record = details.RootElement.GetProperty("record");
        var updated = new Dictionary<string, object?>(StringComparer.Ordinal) { ["kind"] = "post" };
        foreach (var key in new[]
        {
            "id", "slug", "status", "title", "excerpt", "author", "heroImage",
            "content", "seoTitle", "seoDescription"
        })
            updated[key] = record.GetProperty(key).Clone();
        updated["seoTitle"] = "Updated from isolated CMS";
        using var save = new HttpRequestMessage(HttpMethod.Post, "/api/admin/posts")
        {
            Content = JsonContent.Create(updated)
        };
        save.Headers.Add("X-CSRF-Token", token);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(save)).StatusCode);
    }
}
