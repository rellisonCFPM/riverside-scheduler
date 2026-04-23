const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

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

async function getAvailableSlots(date) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('date', date);

  if (error) throw error;

  // Create map of booked slots with who booked them
  const bookedMap = {};
  data.forEach(r => {
    bookedMap[r.time] = r.name;
  });

  // Generate all time slots (8am-6pm in 15-min increments)
  const slots = [];
  for (let h = 8; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 18 && m > 0) break;
      const hour = h % 12 || 12;
      const ampm = h >= 12 ? 'pm' : 'am';
      const time = `${hour}:${m.toString().padStart(2, '0')}${ampm}`;

      slots.push({
        time,
        available: !bookedMap[time],
        bookedBy: bookedMap[time] || null
      });
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(slots)
  };
}

async function createReservation(payload) {
  const { date, times, name, email } = payload;

  if (!date || !times || !Array.isArray(times) || times.length === 0 || !name || !email) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required fields' })
    };
  }

  // Create one reservation record per time slot
  const reservations = times.map(time => ({
    id: `res_${Date.now()}_${time.replace(/[^a-z0-9]/gi, '')}`,
    date,
    time,
    name,
    email,
    created_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('reservations')
    .insert(reservations)
    .select();

  if (error) {
    if (error.code === '23505') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'One or more time slots already booked' })
      };
    }
    throw error;
  }

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({ success: true, reserved: times.length })
  };
}

async function cancelReservation(payload) {
  const { date, time, email } = payload;

  if (!date || !time || !email) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required fields' })
    };
  }

  // Verify ownership
  const { data: reservation, error: fetchError } = await supabase
    .from('reservations')
    .select('email')
    .eq('date', date)
    .eq('time', time)
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
    .eq('date', date)
    .eq('time', time);

  if (deleteError) throw deleteError;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true })
  };
}
