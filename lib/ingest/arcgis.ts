// Paginated ArcGIS REST query (FeatureServer / MapServer layer).
export async function* arcgisQuery(
  fetchImpl: typeof fetch,
  layerUrl: string,
  params: { where: string; outFields: string[]; orderBy: string; pageSize: number },
): AsyncGenerator<Record<string, unknown>> {
  for (let offset = 0; ; offset += params.pageSize) {
    const qs = new URLSearchParams({
      where: params.where,
      outFields: params.outFields.join(","),
      orderByFields: params.orderBy,
      resultOffset: String(offset),
      resultRecordCount: String(params.pageSize),
      returnGeometry: "false",
      f: "json",
    });
    const res = await fetchImpl(`${layerUrl}/query?${qs}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`ArcGIS query failed (${res.status}) for ${layerUrl}`);
    const json = (await res.json()) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } };
    if (json.error) throw new Error(`ArcGIS error: ${json.error.message ?? "unknown"}`);
    const features = json.features ?? [];
    for (const f of features) yield f.attributes;
    if (features.length < params.pageSize && !json.exceededTransferLimit) return;
    if (features.length === 0) return;
  }
}
