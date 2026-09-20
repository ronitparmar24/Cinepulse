import { titleById, allTitles } from './catalog';
import type { Title } from './types';

export interface CinemaNode {
  id: string;
  label: string;
  sublabel?: string;
  type: 'title' | 'director' | 'actor' | 'genre';
  image?: string | null;
  hop: number;
  titleId?: string;
  personId?: number;
}

export interface CinemaEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface CinemaGraph {
  rootId: string;
  nodes: CinemaNode[];
  edges: CinemaEdge[];
}

export async function buildCinemaGraph(rootTitleId: string, maxNodes = 24): Promise<CinemaGraph> {
  const root = await titleById(rootTitleId);
  const catalog = await allTitles();

  const nodesMap = new Map<string, CinemaNode>();
  const edges: CinemaEdge[] = [];
  const edgeSet = new Set<string>();

  function addEdge(source: string, target: string, label: string) {
    const key = `${source}->${target}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({ id: `e_${edgeSet.size}`, source, target, label });
    }
  }

  // Hop 0: Target Title
  nodesMap.set(root.id, {
    id: root.id,
    label: root.title,
    sublabel: root.releaseDate?.slice(0, 4) || undefined,
    type: 'title',
    image: root.poster,
    hop: 0,
    titleId: root.id
  });

  // Hop 1: Director
  if (root.director) {
    const dirId = `dir_${root.director.replace(/\s+/g, '_')}`;
    nodesMap.set(dirId, {
      id: dirId,
      label: root.director,
      sublabel: 'Director',
      type: 'director',
      hop: 1,
      personId: root.directorId || undefined
    });
    addEdge(root.id, dirId, 'directed by');
  }

  // Hop 1: Top 4 Cast
  const topCast = (root.cast || []).slice(0, 4);
  for (const c of topCast) {
    const castNodeId = `actor_${c.name.replace(/\s+/g, '_')}`;
    nodesMap.set(castNodeId, {
      id: castNodeId,
      label: c.name,
      sublabel: c.character || 'Actor',
      type: 'actor',
      image: c.profile,
      hop: 1,
      personId: c.id || undefined
    });
    addEdge(root.id, castNodeId, 'stars');
  }

  // Hop 1: Primary Genres (up to 2)
  for (const g of root.genres.slice(0, 2)) {
    const genreId = `genre_${g.toLowerCase()}`;
    nodesMap.set(genreId, {
      id: genreId,
      label: g,
      type: 'genre',
      hop: 1
    });
    addEdge(root.id, genreId, 'genre');
  }

  // Hop 2: Related Catalog Titles
  for (const other of catalog) {
    if (other.id === root.id) continue;
    if (nodesMap.size >= maxNodes) break;

    // Check shared director
    if (root.director && other.director === root.director) {
      const dirId = `dir_${root.director.replace(/\s+/g, '_')}`;
      if (!nodesMap.has(other.id)) {
        nodesMap.set(other.id, {
          id: other.id,
          label: other.title,
          sublabel: other.releaseDate?.slice(0, 4) || undefined,
          type: 'title',
          image: other.poster,
          hop: 2,
          titleId: other.id
        });
      }
      addEdge(dirId, other.id, 'directed');
    }

    // Check shared actors
    for (const c of topCast) {
      if (nodesMap.size >= maxNodes) break;
      const sharedActor = (other.cast || []).find((ac: any) => ac.name === c.name);
      if (sharedActor) {
        const actorId = `actor_${c.name.replace(/\s+/g, '_')}`;
        if (!nodesMap.has(other.id)) {
          nodesMap.set(other.id, {
            id: other.id,
            label: other.title,
            sublabel: other.releaseDate?.slice(0, 4) || undefined,
            type: 'title',
            image: other.poster,
            hop: 2,
            titleId: other.id
          });
        }
        addEdge(actorId, other.id, 'stars in');
      }
    }
  }

  return {
    rootId: root.id,
    nodes: Array.from(nodesMap.values()),
    edges
  };
}
