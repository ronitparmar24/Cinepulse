const token = '9e691d518ccad230b5ed6164b26797a1';
const ids = ['1003596', '1400940', '100', '1101383'];
for (const id of ids) {
  const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(id, data.title || data.name);
}
