import { NextResponse } from 'next/server';

export interface ReverseGeocodeRequestBody {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeSuccessResponse {
  success: true;
  address: string | null;
  confidence?: number;
  message?: string;
}

export interface ReverseGeocodeErrorResponse {
  success: false;
  error: string;
  message: string;
}

export type ReverseGeocodeResponse = ReverseGeocodeSuccessResponse | ReverseGeocodeErrorResponse;

export async function POST(request: Request): Promise<NextResponse<ReverseGeocodeResponse>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Request body must be valid JSON with numeric lat and lng.',
        },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'Request body must be an object with lat and lng.',
        },
        { status: 400 },
      );
    }

    const { lat, lng } = body as Record<string, unknown>;

    const latNum = typeof lat === 'number' ? lat : parseFloat(String(lat));
    const lngNum = typeof lng === 'number' ? lng : parseFloat(String(lng));

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Latitude must be a valid number between -90 and 90.',
        },
        { status: 400 },
      );
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Longitude must be a valid number between -180 and 180.',
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'CONFIG_ERROR',
          message: 'Reverse geocoding service is not configured (missing GEOAPIFY_API_KEY).',
        },
        { status: 503 },
      );
    }

    const geoapifyUrl = new URL('https://api.geoapify.com/v1/geocode/reverse');
    geoapifyUrl.searchParams.set('lat', latNum.toString());
    geoapifyUrl.searchParams.set('lon', lngNum.toString());
    geoapifyUrl.searchParams.set('format', 'json');
    geoapifyUrl.searchParams.set('apiKey', apiKey.trim());

    let providerRes: Response;
    try {
      providerRes = await fetch(geoapifyUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
      return NextResponse.json(
        {
          success: false,
          error: 'PROVIDER_NETWORK_ERROR',
          message: `Failed to reach reverse geocoding provider: ${msg}`,
        },
        { status: 502 },
      );
    }

    if (!providerRes.ok) {
      const errText = await providerRes.text().catch(() => '');
      return NextResponse.json(
        {
          success: false,
          error: 'PROVIDER_ERROR',
          message: `Reverse geocoding provider responded with status ${providerRes.status}: ${errText.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }

    const data = await providerRes.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'PROVIDER_ERROR',
          message: 'Invalid response from reverse geocoding provider.',
        },
        { status: 502 },
      );
    }

    let formattedAddress: string | null = null;
    let confidence: number | undefined;

    if (Array.isArray(data.results) && data.results.length > 0) {
      const first = data.results[0];
      formattedAddress =
        first.formatted ||
        [first.address_line1, first.address_line2].filter(Boolean).join(', ') ||
        null;
      confidence = first.confidence ?? first.rank?.confidence;
    } else if (Array.isArray(data.features) && data.features.length > 0) {
      const props = data.features[0].properties;
      formattedAddress =
        props?.formatted ||
        [props?.address_line1, props?.address_line2].filter(Boolean).join(', ') ||
        null;
      confidence = props?.confidence ?? props?.rank?.confidence;
    }

    if (!formattedAddress || !formattedAddress.trim()) {
      return NextResponse.json(
        {
          success: true,
          address: null,
          message:
            'No street address found for these coordinates. Please enter your street address or landmark manually.',
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        address: formattedAddress.trim(),
        confidence,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message,
      },
      { status: 500 },
    );
  }
}
