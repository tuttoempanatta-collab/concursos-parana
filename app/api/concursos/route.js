import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-static';

export async function GET() {
  try {
    const parsedFilePath = path.join(process.cwd(), 'parsed_data.json');
    let concursos = [];

    if (fs.existsSync(parsedFilePath)) {
      const rawData = fs.readFileSync(parsedFilePath, 'utf-8');
      concursos = JSON.parse(rawData);
    }

    // Fallback if no data found
    if (concursos.length === 0) {
        return NextResponse.json({
            success: false,
            error: 'No hay datos disponibles. Ejecute node parse.js primero.'
        }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      count: concursos.length,
      data: concursos
    });

  } catch (error) {
    console.error('Error in API route:', error.message);
    return NextResponse.json({ 
        success: false, 
        error: 'Failed to load concursos',
        details: error.message 
    }, { status: 500 });
  }
}
