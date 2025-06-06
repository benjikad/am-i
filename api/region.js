// api/country.js
export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  try {
    // Get IP address from request headers
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || req.ip || 'unknown';
    
    // Get country from Vercel's geolocation headers
    const country = req.headers.get('x-vercel-ip-country') || 'Unknown';
    const countryRegion = req.headers.get('x-vercel-ip-country-region') || null;
    const city = req.headers.get('x-vercel-ip-city') || null;
    
    // Handle localhost/development
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'unknown' || country === 'Unknown') {
      return new Response(JSON.stringify({
        ip: ip,
        country: 'Unknown',
        countryCode: 'Unknown',
        message: 'Cannot determine country for localhost/development'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Country name mapping (since Vercel only provides country codes)
    const countryNames = {
      'US': 'United States',
      'CA': 'Canada',
      'GB': 'United Kingdom',
      'DE': 'Germany',
      'FR': 'France',
      'JP': 'Japan',
      'AU': 'Australia',
      'BR': 'Brazil',
      'IN': 'India',
      'CN': 'China',
      'RU': 'Russia',
      'IT': 'Italy',
      'ES': 'Spain',
      'MX': 'Mexico',
      'KR': 'South Korea',
      'NL': 'Netherlands',
      'SE': 'Sweden',
      'NO': 'Norway',
      'DK': 'Denmark',
      'FI': 'Finland',
      'PL': 'Poland',
      'CH': 'Switzerland',
      'AT': 'Austria',
      'BE': 'Belgium',
      'IE': 'Ireland',
      'PT': 'Portugal',
      'GR': 'Greece',
      'CZ': 'Czech Republic',
      'HU': 'Hungary',
      'RO': 'Romania',
      'BG': 'Bulgaria',
      'HR': 'Croatia',
      'SI': 'Slovenia',
      'SK': 'Slovakia',
      'LT': 'Lithuania',
      'LV': 'Latvia',
      'EE': 'Estonia',
      'CY': 'Cyprus',
      'MT': 'Malta',
      'LU': 'Luxembourg',
      // Add more as needed
    };

    const countryName = countryNames[country] || country;

    const response = {
      ip: ip,
      country: countryName,
      countryCode: country
    };

    // Add optional data if available
    if (countryRegion) response.region = countryRegion;
    if (city) response.city = city;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
