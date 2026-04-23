/// netlify/functions/reservations.js
// This is a Netlify Function that handles all API requests

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Helper: CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Handle preflight
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const { action } = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET' && action === 'list') {
      return await getReservations();
    }

    if (event.httpMethod === 'GET' && action === 'available') {
      const { date } = event.queryStringParameters;
      return await getAvailableSlots(date);
    }

    if (event.httpMethod === 'POST' && action === 'reserve') {
      const data = JSON.parse(event.body);
      return await createReservation(data);
    }

    if (event.httpMethod === 'DELETE' && action === 'cancel') {
      const data = JSON.parse(event.body);
      return await cancelReservation(data);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Get all reservations
async function getReservations() {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('date', { ascending: true });

  if (error) throw error;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(data || [])
  };
}

// Get available slots for a date
async function getAvailableSlots(date) {
  const { data, error } = await supabase
    .from('reservations')
    .select('time')
    .eq('date', date);

  if (error) throw error;

  const reserved = new Set(data.map(r => r.time));

  // Generate all time slots (8am-7pm in 15-min increments)
  const slots = [];
  for (let h = 8; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 18 && m > 0) break;
      const hour = h % 12 || 12;
      const ampm = h >= 12 ? 'pm' : 'am';
      const time = `${hour}:${m.toString().padStart(2, '0')}${ampm}`;

      slots.push({
        time,
        available: !reserved.has(time)
      });
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(slots)
  };
}

// Create reservation
async function createReservation(payload) {
  const { date, time, name, email } = payload;

  if (!date || !time || !name || !email) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required fields' })
    };
  }

  const id = `res_${Date.now()}`;

  const { data, error } = await supabase
    .from('reservations')
    .insert([{
      id,
      date,
      time,
      name,
      email,
      created_at: new Date().toISOString()
    }])
    .select();

  if (error) {
    if (error.code === '23505') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Time slot already booked' })
      };
    }
    throw error;
  }

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(data[0])
  };
}

// Cancel reservation
async function cancelReservation(payload) {
  const { id, email } = payload;

  if (!id || !email) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing id or email' })
    };
  }

  // Verify ownership
  const { data: reservation, error: fetchError } = await supabase
    .from('reservations')
    .select('email')
    .eq('id', id)
    .single();

  if (fetchError || !reservation) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Reservation not found' })
    };
  }

  if (reservation.email !== email) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  const { error: deleteError } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id);

  if (deleteError) throw deleteError;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true })
  };
}
