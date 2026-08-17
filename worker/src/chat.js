/**
 * Colega Chat — el cerebro conversacional.
 *
 * Este módulo es un proxy fino hacia Claude. Dos decisiones de diseño:
 *
 * 1. La clave de API vive SOLO aquí (secreto del Worker). Nunca puede ir en
 *    la app: cualquiera abriría el código fuente y la usaría a tu costa.
 *
 * 2. Claude no ejecuta nada. Devuelve *acciones propuestas* que el teléfono
 *    aplica sobre sus propios datos, y solo si tú las confirmas. El servidor
 *    no escribe en tu agenda: la agenda no está aquí.
 */

import Anthropic from '@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Colega-Key'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });

// Herramientas que Claude puede proponer. Se ejecutan en el teléfono.
const TOOLS = [
  {
    name: 'crear_tarea',
    description: 'Crea una tarea. Úsala cuando el usuario menciona algo que debe hacer. Si dice una hora, ponla: sin hora no hay recordatorio.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD' },
        hora: { type: 'string', description: 'HH:MM en 24h' },
        prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        categoria: { type: 'string' },
        recurrencia: { type: 'string', enum: ['', 'daily', 'weekdays', 'weekly'] }
      },
      required: ['titulo']
    }
  },
  {
    name: 'crear_objetivo',
    description: 'Crea un objetivo con sus hitos. Un objetivo sin hitos verificables es un deseo: propón siempre entre 3 y 6.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        porque: { type: 'string', description: 'El motivo real, en palabras del usuario' },
        area: { type: 'string', enum: ['carrera', 'salud', 'aprendizaje', 'finanzas', 'relaciones', 'personal'] },
        horizonte: { type: 'string', enum: ['trimestre', 'ano', 'vida'] },
        fecha_limite: { type: 'string', description: 'AAAA-MM-DD' },
        hitos: { type: 'array', items: { type: 'string' } }
      },
      required: ['titulo']
    }
  },
  {
    name: 'crear_bloque',
    description: 'Añade un bloque de tiempo al plan del día.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        inicio: { type: 'string', description: 'HH:MM' },
        fin: { type: 'string', description: 'HH:MM' },
        tipo: { type: 'string', enum: ['trabajo', 'aprendizaje', 'salud', 'personal', 'descanso'] },
        dias: { type: 'array', items: { type: 'integer' }, description: '0=domingo … 6=sábado. Vacío = solo hoy.' }
      },
      required: ['titulo', 'inicio', 'fin']
    }
  },
  {
    name: 'crear_evento',
    description: 'Añade una reunión o cita al calendario.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD' },
        hora: { type: 'string', description: 'HH:MM' },
        tipo: { type: 'string', enum: ['reunion', 'entrega', 'cita', 'otro'] }
      },
      required: ['titulo', 'fecha']
    }
  },
  {
    name: 'registrar_ejercicio',
    description: 'Registra actividad física ya realizada.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['fuerza', 'cardio', 'caminata', 'deporte', 'movilidad', 'otro'] },
        minutos: { type: 'integer' },
        intensidad: { type: 'string', enum: ['suave', 'media', 'fuerte'] },
        notas: { type: 'string' }
      },
      required: ['minutos']
    }
  },
  {
    name: 'crear_nota',
    description: 'Guarda información suelta en la bandeja de notas. Úsala cuando el usuario quiere recordar algo que NO es una tarea con fecha: una compra, un tema que investigar, una idea, un dato o un contacto. Ante la duda entre tarea y nota: si tiene que hacerse en un momento concreto es tarea; si solo hay que no olvidarlo, es nota.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'La información, tal como la diría el usuario' },
        tipo: {
          type: 'string',
          enum: ['idea', 'compra', 'investigar', 'contacto', 'info'],
          description: 'compra = algo que comprar · investigar = mirar más adelante · contacto = personas y datos · idea = ocurrencia · info = cualquier otro dato'
        }
      },
      required: ['texto']
    }
  },
  {
    name: 'crear_tarjeta',
    description: 'Crea una tarjeta de repaso espaciado para algo que el usuario quiere memorizar.',
    input_schema: {
      type: 'object',
      properties: {
        pregunta: { type: 'string' },
        respuesta: { type: 'string' }
      },
      required: ['pregunta', 'respuesta']
    }
  }
];

function systemPrompt(snapshot) {
  return `Eres Colega, el asistente personal de ${snapshot.nombre || 'tu usuario'}. Hablas español, tuteas, y eres su copiloto — no su animador.

CONTEXTO ACTUAL (real, de su teléfono):
- Ahora: ${snapshot.ahora}
- Tareas pendientes hoy: ${snapshot.tareasHoy || 0}${snapshot.atrasadas ? ` · atrasadas: ${snapshot.atrasadas}` : ''}
- Top 3 del día: ${snapshot.top3?.length ? snapshot.top3.join(' | ') : 'sin definir'}
- Eventos hoy: ${snapshot.eventosHoy?.length ? snapshot.eventosHoy.join(' | ') : 'ninguno'}
- Bloque en curso: ${snapshot.bloqueActual || 'ninguno'}
- Objetivos activos: ${snapshot.objetivos?.length ? snapshot.objetivos.join(' | ') : 'ninguno'}
- Hoy: ${snapshot.focoMin || 0} min de foco, ${snapshot.medMin || 0} min de meditación, ${snapshot.ejMin || 0} min de ejercicio
- Racha: ${snapshot.racha || 0} días · tarjetas por repasar: ${snapshot.repasos || 0}
- Notas sin revisar en la bandeja: ${snapshot.notasPendientes || 0}

CÓMO TRABAJAS:
- Responde breve. Dos o tres frases salvo que te pidan profundidad. Nada de introducciones ni de repetir la pregunta.
- Cuando el usuario menciona algo que debe hacer, recordar o lograr, usa la herramienta correspondiente en lugar de solo describirlo. Las acciones que propones no se ejecutan solas: él las confirma en pantalla.
- Puedes usar varias herramientas en un mismo turno. Si te dicta tres cosas seguidas, crea las tres.
- Distingue tarea de nota: si algo debe hacerse a una hora concreta es tarea o evento; si solo hay que no olvidarlo (una compra, un tema que mirar, un dato), es nota. No conviertas en tarea con fecha inventada algo que el usuario solo quería apuntar.
- Deduce fechas y horas relativas ("mañana", "el viernes", "en dos semanas") a partir de la fecha actual y escríbelas ya resueltas.
- Una tarea sin hora no genera recordatorio. Si el usuario no la dice y la tarea la necesita, elige una hora sensata y menciónala en tu respuesta.
- Al crear un objetivo, propón siempre hitos verificables. "Ponerme en forma" no se puede marcar como hecho; "correr 5 km sin parar" sí.
- Usa lo que sabes de su contexto. Si tiene tres tareas atrasadas y pide añadir una cuarta, dilo en una frase y luego créala igual — la decisión es suya.
- Si te pide consejo sobre su día, responde con una recomendación concreta, no con un menú de opciones.
- No inventes datos que no estén en el contexto. Si no sabes algo, dilo.
- No felicites por cosas triviales ni añadas emojis decorativos.`;
}

export async function handleChat(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'El asistente no está configurado en este servidor' }, 503);
  }
  // Sin esto el Worker sería un proxy abierto a la API de cualquiera que lo encuentre.
  if (env.APP_SECRET && request.headers.get('X-Colega-Key') !== env.APP_SECRET) {
    return json({ error: 'No autorizado' }, 401);
  }

  const body = await request.json();
  const snapshot = body.snapshot || {};
  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];

  if (!history.length) return json({ error: 'Sin mensajes' }, 400);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: systemPrompt(snapshot),
      tools: TOOLS,
      messages: history
    });

    if (response.stop_reason === 'refusal') {
      return json({
        text: 'No puedo ayudarte con eso. Prueba a reformularlo.',
        actions: []
      });
    }

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    const actions = response.content
      .filter(b => b.type === 'tool_use')
      .map(b => ({ name: b.name, input: b.input }));

    return json({
      text: text || (actions.length ? 'Listo, revisa lo que preparé:' : '…'),
      actions,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      }
    });
  } catch (e) {
    const status = e?.status || 500;
    const msg = status === 429
      ? 'Demasiadas peticiones, espera un momento'
      : status === 401
        ? 'La clave de API del servidor no es válida'
        : e.message || 'Error del asistente';
    return json({ error: msg }, status >= 400 && status < 600 ? status : 500);
  }
}

export { CORS as CHAT_CORS };
