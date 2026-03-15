export async function loadBuildings(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data.buildings;
}
