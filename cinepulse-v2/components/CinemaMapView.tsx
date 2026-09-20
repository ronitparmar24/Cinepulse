'use client';
import { useState, useEffect } from 'react';
import { Compass, Film, User, Tag, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import type { CinemaGraph, CinemaNode } from '@/lib/cinemaMap';
import { api } from './client';
import { useApp } from './Context';
import { Loading } from './UI';

export function CinemaMapView({ initialTitleId }: { initialTitleId?: string }) {
  const { openTitle } = useApp();
  const [titleId, setTitleId] = useState(initialTitleId || 'dune-part-two');
  const [graph, setGraph] = useState<CinemaGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<CinemaNode | null>(null);

  useEffect(() => {
    if (!titleId) return;
    setLoading(true);
    api<{ graph: CinemaGraph }>(`/cinema-map/${titleId}`, 'GET')
      .then(res => setGraph(res.graph))
      .catch(() => setGraph(null))
      .finally(() => setLoading(false));
  }, [titleId]);

  if (loading) return <Loading />;
  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="pad-page" style={{ textAlign: 'center', margin: '40px auto' }}>
        <Compass size={36} className="mint" style={{ margin: '0 auto 12px' }} />
        <h3>Cinema Map</h3>
        <p className="muted">Relational 2-hop TMDB graph explorer.</p>
      </div>
    );
  }

  // Calculate coordinates in a 800x520 viewBox
  const width = 800;
  const height = 520;
  const cx = width / 2;
  const cy = height / 2;

  const rootNode = graph.nodes.find(n => n.hop === 0) || graph.nodes[0];
  const hop1Nodes = graph.nodes.filter(n => n.hop === 1);
  const hop2Nodes = graph.nodes.filter(n => n.hop === 2);

  const nodePositions = new Map<string, { x: number; y: number }>();
  nodePositions.set(rootNode.id, { x: cx, y: cy });

  // Distribute Hop 1 around circle of radius 140
  const r1 = 140;
  hop1Nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / hop1Nodes.length - Math.PI / 2;
    nodePositions.set(node.id, {
      x: cx + r1 * Math.cos(angle),
      y: cy + r1 * Math.sin(angle)
    });
  });

  // Distribute Hop 2 around circle of radius 230
  const r2 = 230;
  hop2Nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, hop2Nodes.length) - Math.PI / 2 + 0.2;
    nodePositions.set(node.id, {
      x: cx + r2 * Math.cos(angle),
      y: cy + r2 * Math.sin(angle)
    });
  });

  function getNodeColor(node: CinemaNode) {
    if (node.hop === 0) return 'var(--neon-mint)';
    if (node.type === 'director') return '#f59e0b';
    if (node.type === 'actor') return '#38bdf8';
    if (node.type === 'genre') return '#ec4899';
    return '#a78bfa';
  }

  return (
    <div className="pad-page" style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow mint"><Compass size={14} /> RELATIONAL CINEMATIC GRAPH</span>
          <h2>Cinema Map</h2>
          <p className="muted">
            Explore 2-hop connective pathways across cast, directors, genres, and film catalog relationships.
          </p>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div className="glass pad-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {/* Legend */}
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 12, fontSize: 11, background: 'rgba(7,9,11,0.85)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-mint)' }} /> Target Title</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Director</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} /> Cast</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#ec4899' }} /> Genre</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa' }} /> 2-Hop Film</span>
        </div>

        {/* Hover Inspector Card */}
        {hoveredNode && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(7,9,11,0.92)', border: '1px solid rgba(0,245,155,0.3)', borderRadius: 8, padding: '10px 14px', maxWidth: 280, pointerEvents: 'none' }}>
            <span className="eyebrow" style={{ color: getNodeColor(hoveredNode) }}>{hoveredNode.type.toUpperCase()} · HOP {hoveredNode.hop}</span>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{hoveredNode.label}</div>
            {hoveredNode.sublabel && <div style={{ fontSize: 11, color: '#8d989f' }}>{hoveredNode.sublabel}</div>}
            {hoveredNode.titleId && <div className="text-xs mint" style={{ marginTop: 4 }}>Click to open or re-center graph →</div>}
          </div>
        )}

        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Background Concentric Guide Rings */}
          <circle cx={cx} cy={cy} r={r1} fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
          <circle cx={cx} cy={cy} r={r2} fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />

          {/* Edges */}
          {graph.edges.map(edge => {
            const p1 = nodePositions.get(edge.source);
            const p2 = nodePositions.get(edge.target);
            if (!p1 || !p2) return null;
            const isHighlighted = hoveredNode && (hoveredNode.id === edge.source || hoveredNode.id === edge.target);

            return (
              <line
                key={edge.id}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isHighlighted ? 'var(--neon-mint)' : 'rgba(255,255,255,0.12)'}
                strokeWidth={isHighlighted ? 2 : 1}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            const isHovered = hoveredNode?.id === node.id;
            const radius = node.hop === 0 ? 22 : node.hop === 1 ? 16 : 13;
            const color = getNodeColor(node);

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  if (node.titleId) {
                    if (node.hop === 0) openTitle(node.titleId);
                    else setTitleId(node.titleId);
                  }
                }}
              >
                <circle
                  r={radius}
                  fill="#0c1015"
                  stroke={color}
                  strokeWidth={isHovered ? 3 : node.hop === 0 ? 2.5 : 1.5}
                />
                {node.hop === 0 ? (
                  <Sparkles size={14} color={color} x={-7} y={-7} />
                ) : node.type === 'director' || node.type === 'actor' ? (
                  <User size={12} color={color} x={-6} y={-6} />
                ) : node.type === 'genre' ? (
                  <Tag size={11} color={color} x={-5.5} y={-5.5} />
                ) : (
                  <Film size={11} color={color} x={-5.5} y={-5.5} />
                )}
                <text
                  y={radius + 12}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize={node.hop === 0 ? 11 : 9}
                  fontWeight={node.hop === 0 ? 700 : 500}
                >
                  {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
