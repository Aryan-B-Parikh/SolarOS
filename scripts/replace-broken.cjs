const fs = require('fs');
const content = fs.readFileSync('scripts/_progress-journey.mjs', 'utf8');
// Find the broken section and replace it
const broken = `  // 5. Create installation (scheduled, then completed) — reuse if exists
  let installation = await prisma.installation.findFirst({ where: { order_id: order.id } });
  if (!installation) {
    installation = await prisma.installation.create({
      data: {
        order_id: order.id,
        status: 'COMPLETED',
        scheduled_on: new Date(),
        slot: 'MORNING',
        crew_lead_id: null,
        started_at: new Date(),
        finished_at: new Date(),
        test_reading_w: 2850,
        installed_capacity_kw: 3,
        signoff_hash: \`sha256_flow_new_\${Date.now()}\`,
        signed_at: new Date(),
        checklist: {
          mounting_stands_rigid: true,
          modules_clamped_aligned: true,
          dc_ac_cables_conduit: true,
          earthing_resistance_tested: true,
          inverter_synchronized: true,
        },
      },
    },
  });
  }
  } else {
  }
    console.log('Installation already exists:', installation ? installation.id : 'none');
  }
  console.log('Installation:', installation ? installation.id : 'none');`;

const fixed = `  // 5. Create installation (scheduled, then completed) — reuse if exists
  let installation = await prisma.installation.findFirst({ where: { order_id: order.id } });
  if (!installation) {
    installation = await prisma.installation.create({
      data: {
        order_id: order.id,
        status: 'COMPLETED',
        scheduled_on: new Date(),
        slot: 'MORNING',
        crew_lead_id: null,
        started_at: new Date(),
        finished_at: new Date(),
        test_reading_w: 2850,
        installed_capacity_kw: 3,
        signoff_hash: \`sha256_flow_new_\${Date.now()}\`,
        signed_at: new Date(),
        checklist: {
          mounting_stands_rigid: true,
          modules_clamped_aligned: true,
          dc_ac_cables_conduit: true,
          earthing_resistance_tested: true,
          inverter_synchronized: true,
        },
      },
    });
    console.log('Installation created:', installation.id);
  } else {
    console.log('Installation already exists:', installation.id);
  }`;

if (content.includes(broken)) {
  fs.writeFileSync('scripts/_progress-journey.mjs', content.replace(broken, fixed));
  console.log('replaced broken installation section');
} else {
  console.log('broken section not found exactly, checking content...');
}
