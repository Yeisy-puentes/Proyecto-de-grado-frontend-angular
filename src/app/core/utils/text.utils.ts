/** Texto comparable en búsquedas: sin tildes y en minúsculas ("María" -> "maria"). */
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
