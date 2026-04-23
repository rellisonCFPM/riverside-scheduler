exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Debug: Log what we have
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: "Debug info",
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlLength: supabaseUrl ? supabaseUrl.length : 0,
      keyLength: supabaseKey ? supabaseKey.length : 0
    })
  };
};
