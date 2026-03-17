const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- ACTUALIZANDO DATOS EN VIVO (FIREBASE) ---');

try {
    // 1. Ejecutar el scraper para obtener datos frescos
    console.log('1. Ejecutando scraper...');
    execSync('node parse.js', { stdio: 'inherit' });

    // 2. Asegurarse de que el archivo existe y copiarlo a public/
    if (fs.existsSync('parsed_data.json')) {
        console.log('2. Copiando datos a carpeta pública...');
        fs.copyFileSync('parsed_data.json', path.join('public', 'parsed_data.json'));
        
        // También a la carpeta out/ si ya existe para deployment rápido
        if (fs.existsSync('out')) {
            fs.copyFileSync('parsed_data.json', path.join('out', 'parsed_data.json'));
        }
    } else {
        throw new Error('No se generó parsed_data.json');
    }

    // 3. Desplegar solo el archivo de datos a Firebase Hosting
    // Usamos --only hosting para ser más rápidos y npx para asegurar que firebase esté disponible
    console.log('3. Desplegando en Firebase Hosting...');
    execSync('npx firebase deploy --only hosting', { stdio: 'inherit' });

    console.log('\n¡ÉXITO! Los nuevos concursos ya están en la nube.');
    console.log('URL de datos: https://concursos-entre-rios.web.app/parsed_data.json');

} catch (error) {
    console.error('\nERROR durante la actualización:', error.message);
    process.exit(1);
}
