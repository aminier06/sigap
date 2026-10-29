import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { tipo, destinatarios, desde, hasta, usuario, rezagados, dias, coordinadores, umbral } = body

    if (!destinatarios?.length) {
      return new Response(JSON.stringify({ error: 'No hay destinatarios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const fecha = new Date().toLocaleDateString('es-DO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })

    let asunto = ''
    let htmlBody = ''

    const estiloBase = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto;`
    const header = `
      <div style="background:linear-gradient(90deg,#0d4a7a,#1a6fb5);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px;">SIGAP</h1>
        <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
          Sistema de Gestión de Acompañamiento Pedagógico
        </p>
      </div>`
    const footer = `
      <hr style="border:none;border-top:1px solid #edf3f8;margin:20px 0;">
      <p style="font-size:11px;color:#8fa5bb;text-align:center;margin:0;">
        MINERD · Dirección de Educación Primaria · Desarrollado por Aneudy Minier
      </p>`

    if (tipo === 'semanal') {
      const { data: registros } = await supabaseAdmin
        .from('acompañamientos')
        .select('*')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .eq('estado', 'Enviado')

      const total    = registros?.length || 0
      const centros  = new Set(registros?.map((r: any) => r.centro_educativo).filter(Boolean)).size
      const docentes = new Set(registros?.map((r: any) => r.nombre_docente).filter(Boolean)).size

      const areas: Record<string, number> = {}
      registros?.forEach((r: any) => {
        if (r.area_acompanada) areas[r.area_acompanada] = (areas[r.area_acompanada] || 0) + 1
      })
      const topAreas = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 3)

      asunto = `SIGAP — Reporte Semanal del ${desde} al ${hasta}`
      htmlBody = `
        <div style="${estiloBase}">
          ${header}
          <div style="background:#fff;padding:28px;border:1px solid #dce9f5;border-radius:0 0 12px 12px;">
            <h2 style="color:#0d4a7a;margin:0 0 8px;">Reporte Semanal</h2>
            <p style="color:#617384;font-size:13px;">Período: <strong>${desde}</strong> al <strong>${hasta}</strong></p>
            <p style="color:#617384;font-size:13px;margin-bottom:20px;">Generado por: ${usuario || 'Sistema'} · ${fecha}</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
              <div style="background:#e8f4fb;border-radius:10px;padding:16px;text-align:center;">
                <div style="font-size:32px;font-weight:900;color:#0d4a7a;">${total}</div>
                <div style="font-size:12px;color:#617384;">Acompañamientos</div>
              </div>
              <div style="background:#e8f4fb;border-radius:10px;padding:16px;text-align:center;">
                <div style="font-size:32px;font-weight:900;color:#0d4a7a;">${centros}</div>
                <div style="font-size:12px;color:#617384;">Centros visitados</div>
              </div>
              <div style="background:#e8f4fb;border-radius:10px;padding:16px;text-align:center;">
                <div style="font-size:32px;font-weight:900;color:#0d4a7a;">${docentes}</div>
                <div style="font-size:12px;color:#617384;">Docentes</div>
              </div>
            </div>
            ${topAreas.length > 0 ? `
              <h3 style="color:#0d4a7a;font-size:14px;margin-bottom:8px;">Áreas más acompañadas</h3>
              ${topAreas.map(([area, n]) => `
                <div style="display:flex;justify-content:space-between;padding:8px 12px;
                  background:#f8fbfe;border-radius:8px;margin-bottom:4px;font-size:13px;">
                  <span>${area}</span><strong>${n}</strong>
                </div>`).join('')}
            ` : ''}
            ${footer}
          </div>
        </div>`

    } else if (tipo === 'alerta_rezago') {
      asunto = `SIGAP ⚠️ Alerta — ${rezagados?.length || 0} técnico(s) sin registros en ${dias} días`
      htmlBody = `
        <div style="${estiloBase}">
          ${header}
          <div style="background:#fff;padding:28px;border:1px solid #dce9f5;border-radius:0 0 12px 12px;">
            <div style="background:#fff8f0;border:1px solid #fcd9a0;border-radius:10px;padding:16px;margin-bottom:20px;">
              <h2 style="color:#8a5d00;margin:0 0 8px;">⚠️ Alerta de rezago</h2>
              <p style="color:#8a5d00;font-size:13px;margin:0;">
                ${rezagados?.length || 0} técnico(s) llevan más de <strong>${dias} días</strong> sin registrar acompañamientos.
              </p>
              <p style="color:#617384;font-size:12px;margin:8px 0 0;">Generado: ${fecha} por ${usuario || 'Sistema'}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f4f0d8;">
                  <th style="padding:10px;text-align:left;border-bottom:1px solid #dce9f5;">Nombre</th>
                  <th style="padding:10px;text-align:left;border-bottom:1px solid #dce9f5;">Rol</th>
                  <th style="padding:10px;text-align:left;border-bottom:1px solid #dce9f5;">Regional</th>
                </tr>
              </thead>
              <tbody>
                ${(rezagados || []).map((u: any) => `
                  <tr>
                    <td style="padding:10px;border-bottom:1px solid #f0f5fa;">${u.nombre || '—'}</td>
                    <td style="padding:10px;border-bottom:1px solid #f0f5fa;font-size:12px;">${u.rol || '—'}</td>
                    <td style="padding:10px;border-bottom:1px solid #f0f5fa;font-size:12px;">${u.regional || '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            ${footer}
          </div>
        </div>`

    } else if (tipo === 'alerta_coordinadores') {
      asunto = `SIGAP 📉 Alerta — Coordinadores con cumplimiento menor al ${umbral}%`
      htmlBody = `
        <div style="${estiloBase}">
          ${header}
          <div style="background:#fff;padding:28px;border:1px solid #dce9f5;border-radius:0 0 12px 12px;">
            <div style="background:#fff0f0;border:1px solid #f4c2bd;border-radius:10px;padding:16px;margin-bottom:20px;">
              <h2 style="color:#b42318;margin:0 0 8px;">📉 Alerta de bajo cumplimiento</h2>
              <p style="color:#b42318;font-size:13px;margin:0;">
                ${coordinadores?.length || 0} coordinador(es) pedagógico(s) tienen un cumplimiento
                menor al <strong>${umbral}%</strong> en el período del ${desde} al ${hasta}.
              </p>
              <p style="color:#617384;font-size:12px;margin:8px 0 0;">Generado: ${fecha} por ${usuario || 'Sistema'}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f4f0d8;">
                  <th style="padding:10px;text-align:left;border-bottom:2px solid #dce9f5;">Coordinador/a</th>
                  <th style="padding:10px;text-align:left;border-bottom:2px solid #dce9f5;">Centro</th>
                  <th style="padding:10px;text-align:center;border-bottom:2px solid #dce9f5;">Planificados</th>
                  <th style="padding:10px;text-align:center;border-bottom:2px solid #dce9f5;">Ejecutados</th>
                  <th style="padding:10px;text-align:center;border-bottom:2px solid #dce9f5;">Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                ${(coordinadores || []).map((c: any) => `
                  <tr style="border-bottom:1px solid #f0f5fa;">
                    <td style="padding:10px;">${c.nombre || '—'}</td>
                    <td style="padding:10px;font-size:12px;">${c.nombre_centro || c.codigo_centro || '—'}</td>
                    <td style="padding:10px;text-align:center;font-weight:700;">${c.planificados}</td>
                    <td style="padding:10px;text-align:center;font-weight:700;">${c.ejecutados}</td>
                    <td style="padding:10px;text-align:center;">
                      <span style="background:#fee2e2;color:#b42318;border-radius:999px;
                        padding:3px 10px;font-weight:800;font-size:12px;">${c.pct}%</span>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
            ${footer}
          </div>
        </div>`

    } else {
      return new Response(JSON.stringify({ error: 'Tipo de reporte no reconocido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Enviar correo con Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada en los secretos de Supabase.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // 'onboarding@resend.dev' es el remitente de pruebas de Resend y solo
        // entrega al dueño de la cuenta. Con el dominio verificado en Resend,
        // esta variable debe apuntar a una dirección propia, por ejemplo
        // 'SIGAP MINERD <sigap@nivelprimario.net>'.
        from: Deno.env.get('CORREO_REMITENTE') ?? 'SIGAP MINERD <onboarding@resend.dev>',
        to: destinatarios,
        subject: asunto,
        html: htmlBody
      })
    })

    const emailResult = await emailResp.json()
    if (!emailResp.ok) {
      return new Response(JSON.stringify({ error: emailResult.message || 'Error al enviar correo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(
      JSON.stringify({ success: true, id: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
