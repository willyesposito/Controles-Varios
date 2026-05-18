// resumenTabuladoHorizontalExcel.js — Parser de Resumen Tabulado Horizontal
//
// Este formato es idéntico al de la Nómina Maestra (una fila por empleado,
// conceptos como columnas), así que reutilizamos el mismo parser.
// Solo cambia el "nombre" del tipo de archivo para guardar el perfil separado.

export { parseNominaMaestra as parseResumenTabulado, detectHeaders } from './nominaMaestra.js';
