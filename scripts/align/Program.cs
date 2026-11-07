using System.Globalization;
using System.Text;
using System.Text.Json;
using Mdk.Api.Analysis.Chan;
using Mdk.Api.Indicators;
using Mdk.Api.Models;

var raw = Console.In.ReadToEnd();
using var doc = JsonDocument.Parse(raw);
var cases = doc.RootElement.GetProperty("cases").EnumerateArray().ToArray();

static decimal D(JsonElement x) => x.ValueKind == JsonValueKind.String
    ? decimal.Parse(x.GetString()!, CultureInfo.InvariantCulture)
    : (decimal)x.GetDouble();

static Candle C(JsonElement e)
{
    var a = e.EnumerateArray().ToArray();
    return new Candle(a[0].GetInt64(), D(a[1]), D(a[2]), D(a[3]), D(a[4]), 0m);
}

static string F(decimal d) => d.ToString("0.########", CultureInfo.InvariantCulture);
static string FN(decimal? d) => d is null ? "null" : F(d.Value);

var mode = doc.RootElement.TryGetProperty("mode", out var mEl) ? mEl.GetString() : "analyze";
var outSb = new StringBuilder("[");
var firstCase = true;
foreach (var c in cases)
{
    var candles = c.GetProperty("candles").EnumerateArray().Select(C).ToList();
    List<Candle>? sub = null;
    if (c.TryGetProperty("sub", out var se) && se.ValueKind == JsonValueKind.Array)
        sub = se.EnumerateArray().Select(C).ToList();

    var o = c.GetProperty("opts");
    decimal Pct(string k, decimal d) => o.TryGetProperty(k, out var v) ? (decimal)v.GetDouble() : d;
    int Iv(string k, int d) => o.TryGetProperty(k, out var v) ? v.GetInt32() : d;
    bool Bv(string k, bool d) => o.TryGetProperty(k, out var v) ? v.GetBoolean() : d;

    var opt = new ChanOptions
    {
        Enabled = Bv("enabled", true),
        DivergenceAreaRatio = Pct("divergenceAreaRatio", 0.9m),
        MaxPoints = Iv("maxPoints", 50),
        WarmupBars = Iv("warmupBars", 30),
        AnalysisBars = Iv("analysisBars", 700),
        RequireSubLevelConfirm = Bv("requireSubLevelConfirm", true),
        SubLevelConfirmWindowBars = Iv("subLevelConfirmWindowBars", 30),
    };

    if (mode == "replay")
    {
        var seeds = ChanBackfill.Replay(candles, sub, sub is null ? null : "5m", null, null, opt, 0, long.MaxValue);
        if (!firstCase) outSb.Append(',');
        firstCase = false;
        outSb.Append('[');
        outSb.Append(string.Join(",", seeds.Select(p =>
            $"{{\"kind\":\"{p.Kind}\",\"side\":\"{p.Side}\",\"time\":{p.Time},\"price\":{F(p.Price)},\"referencePrice\":{F(p.ReferencePrice)},\"stopPrice\":{F(p.StopPrice)},\"areaRatio\":{FN(p.AreaRatio)}}}")));
        outSb.Append(']');
        continue;
    }

    var closes = candles.Select(x => x.Close).ToArray();
    var hist = Macd.Compute(closes).Hist;
    var atrArr = Atr.Compute(candles.Select(x => x.High).ToArray(), candles.Select(x => x.Low).ToArray(), closes, 14);
    var res = ChanAnalyzer.Analyze(candles, hist, atrArr, opt, sub, sub is null ? null : "5m");

    if (!firstCase) outSb.Append(',');
    firstCase = false;
    outSb.Append("{\"fractals\":[");
    outSb.Append(string.Join(",", res.Fractals.Select(f =>
        $"{{\"mergedIndex\":{f.MergedIndex},\"barIndex\":{f.BarIndex},\"price\":{F(f.Price)},\"isTop\":{(f.IsTop ? "true" : "false")},\"confirmBarIndex\":{f.ConfirmBarIndex}}}")));
    outSb.Append("],\"strokes\":[");
    outSb.Append(string.Join(",", res.Strokes.Select(s =>
        $"{{\"startBarIndex\":{s.StartBarIndex},\"startPrice\":{F(s.StartPrice)},\"endBarIndex\":{s.EndBarIndex},\"endPrice\":{F(s.EndPrice)},\"isUp\":{(s.IsUp ? "true" : "false")},\"isConfirmed\":{(s.IsConfirmed ? "true" : "false")},\"stableFromBarIndex\":{(s.StableFromBarIndex is { } v ? v.ToString() : "null")}}}")));
    outSb.Append("],\"pivots\":[");
    outSb.Append(string.Join(",", res.Pivots.Select(p =>
        $"{{\"zg\":{F(p.Zg)},\"zd\":{F(p.Zd)},\"startStrokeIndex\":{p.StartStrokeIndex},\"endStrokeIndex\":{p.EndStrokeIndex},\"strokeCount\":{p.StrokeCount},\"isConfirmed\":{(p.IsConfirmed ? "true" : "false")},\"leavingStrokeIndex\":{(p.LeavingStrokeIndex is { } v ? v.ToString() : "null")}}}")));
    outSb.Append("],\"points\":[");
    outSb.Append(string.Join(",", res.Points.Select(p =>
        $"{{\"kind\":\"{p.Kind}\",\"side\":\"{p.Side}\",\"time\":{p.Time},\"price\":{F(p.Price)},\"referencePrice\":{F(p.ReferencePrice)},\"referenceBarIndex\":{p.ReferenceBarIndex},\"stopPrice\":{F(p.StopPrice)},\"areaRatio\":{FN(p.AreaRatio)}}}")));
    outSb.Append("]}");
}
outSb.Append(']');
Console.Out.Write(outSb.ToString());
