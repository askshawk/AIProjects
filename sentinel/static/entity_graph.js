// Entity Network — D3.js force-directed graph
// Nodes = entities, links = co-occurrence in the same signal.

async function loadEntityGraph() {
    const container = document.getElementById('graphContainer');
    try {
        const res = await fetch('/api/entities');
        const data = await res.json();

        if (!data.nodes || data.nodes.length === 0) {
            container.innerHTML =
                '<div class="placeholder-content"><p>No entities yet. Go to the Feed and click ' +
                '"⚡ Collect New Signals" to populate the network.</p></div>';
            return;
        }

        renderGraph(data);
    } catch (error) {
        console.error('Entity graph error:', error);
        container.innerHTML =
            '<div class="placeholder-content"><p>Error loading entity network.</p></div>';
    }
}

function renderGraph(data) {
    const container = document.getElementById('graphContainer');
    container.innerHTML = '';

    const width = container.clientWidth || 1000;
    const height = 600;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

    // Zoomable/pannable layer
    const g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', (event) => {
        g.attr('transform', event.transform);
    }));

    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const maxMentions = d3.max(data.nodes, d => d.mentions) || 1;
    const radius = d3.scaleSqrt().domain([1, maxMentions]).range([7, 30]);

    const simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.links).id(d => d.id)
            .distance(d => 130 / Math.sqrt(d.weight)))
        .force('charge', d3.forceManyBody().strength(-220))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide().radius(d => radius(d.mentions) + 6));

    const link = g.append('g')
        .attr('stroke', '#cbd5e1')
        .attr('stroke-opacity', 0.6)
        .selectAll('line')
        .data(data.links)
        .join('line')
        .attr('stroke-width', d => Math.min(Math.sqrt(d.weight) * 1.5, 6));

    const node = g.append('g')
        .selectAll('g')
        .data(data.nodes)
        .join('g')
        .call(drag(simulation));

    node.append('circle')
        .attr('r', d => radius(d.mentions))
        .attr('fill', (d, i) => color(i % 10))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);

    node.append('title').text(d => `${d.id} — ${d.mentions} mention(s)`);

    node.append('text')
        .text(d => d.id)
        .attr('x', d => radius(d.mentions) + 5)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('fill', '#1f2937')
        .attr('pointer-events', 'none');

    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function drag(sim) {
        function dragstarted(event, d) {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }
}

loadEntityGraph();
