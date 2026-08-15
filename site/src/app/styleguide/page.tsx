'use client';

import styles from './StyleGuide.module.css';

export default function StyleGuidePage() {
  return (
    <div className={styles.styleguide}>
      <header className={styles.header}>
        <h1>Parastats Design System</h1>
        <p>Living style guide for ploufbag.com</p>
      </header>

      {/* Table of Contents */}
      <nav className={styles.toc}>
        <h2>Contents</h2>
        <ul>
          <li><a href="#font-options">Font Options</a></li>
          <li><a href="#colors">Colors</a></li>
          <li><a href="#typography">Typography</a></li>
          <li><a href="#spacing">Spacing</a></li>
          <li><a href="#borders">Border Radius</a></li>
          <li><a href="#shadows">Shadows</a></li>
          <li><a href="#buttons">Buttons</a></li>
          <li><a href="#cards">Cards</a></li>
          <li><a href="#alerts">Alerts</a></li>
          <li><a href="#forms">Form Elements</a></li>
        </ul>
      </nav>

      {/* Font Options Section */}
      <section id="font-options" className={styles.section}>
        <h2 className={styles.sectionTitle}>Font Options</h2>
        <p className={styles.sectionDesc}>Compare typography options for the design system</p>

        {/* Option 1: Modern Technical */}
        <div className={styles.fontOptionCard}>
          <div className={styles.fontOptionHeader}>
            <h3>Option 1: Modern Technical</h3>
            <span className={styles.fontOptionTag}>Current + Refined</span>
          </div>
          <p className={styles.fontOptionDesc}>Clean, professional, data-focused - fits the stats/analytics nature</p>
          <div className={styles.fontOptionDemo} style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <div className={styles.fontOptionHeading} style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
              Flight Statistics Dashboard
            </div>
            <div className={styles.fontOptionBody}>
              Track your paragliding flights with detailed metrics. Duration: 2h 34m | Max Altitude: 1,240m | Distance: 45.2km
            </div>
            <div className={styles.fontOptionMono} style={{ fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace" }}>
              const flight = {'{'} duration: "2:34:00", altitude: 1240 {'}'};
            </div>
          </div>
        </div>

        {/* Option 2: Outdoor/Adventure */}
        <div className={styles.fontOptionCard}>
          <div className={styles.fontOptionHeader}>
            <h3>Option 2: Outdoor/Adventure</h3>
            <span className={styles.fontOptionTag}>Rugged</span>
          </div>
          <p className={styles.fontOptionDesc}>Rugged, adventurous - speaks to the paragliding community</p>
          <div className={styles.fontOptionDemo} style={{ fontFamily: "'Source Sans 3', 'Helvetica Neue', sans-serif" }}>
            <div className={styles.fontOptionHeading} style={{ fontFamily: "Barlow, Oswald, sans-serif", fontWeight: 600, letterSpacing: '-0.02em' }}>
              Flight Statistics Dashboard
            </div>
            <div className={styles.fontOptionBody}>
              Track your paragliding flights with detailed metrics. Duration: 2h 34m | Max Altitude: 1,240m | Distance: 45.2km
            </div>
            <div className={styles.fontOptionMono} style={{ fontFamily: "'Source Code Pro', monospace" }}>
              const flight = {'{'} duration: "2:34:00", altitude: 1240 {'}'};
            </div>
          </div>
        </div>

        {/* Option 3: Sporty/Dynamic */}
        <div className={styles.fontOptionCard}>
          <div className={styles.fontOptionHeader}>
            <h3>Option 3: Sporty/Dynamic</h3>
            <span className={styles.fontOptionTagHighlight}>Recommended</span>
          </div>
          <p className={styles.fontOptionDesc}>Athletic, energetic - similar to Strava's aesthetic</p>
          <div className={styles.fontOptionDemo} style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}>
            <div className={styles.fontOptionHeading} style={{ fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 }}>
              Flight Statistics Dashboard
            </div>
            <div className={styles.fontOptionBody}>
              Track your paragliding flights with detailed metrics. Duration: 2h 34m | Max Altitude: 1,240m | Distance: 45.2km
            </div>
            <div className={styles.fontOptionMono} style={{ fontFamily: "'Fira Code', monospace" }}>
              const flight = {'{'} duration: "2:34:00", altitude: 1240 {'}'};
            </div>
          </div>
        </div>

        {/* Option 4: Premium/Refined */}
        <div className={styles.fontOptionCard}>
          <div className={styles.fontOptionHeader}>
            <h3>Option 4: Premium/Refined</h3>
            <span className={styles.fontOptionTag}>Elegant</span>
          </div>
          <p className={styles.fontOptionDesc}>Elegant, high-end gear aesthetic</p>
          <div className={styles.fontOptionDemo} style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
            <div className={styles.fontOptionHeading} style={{ fontFamily: "Sora, 'DM Sans', sans-serif", fontWeight: 600 }}>
              Flight Statistics Dashboard
            </div>
            <div className={styles.fontOptionBody}>
              Track your paragliding flights with detailed metrics. Duration: 2h 34m | Max Altitude: 1,240m | Distance: 45.2km
            </div>
            <div className={styles.fontOptionMono} style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              const flight = {'{'} duration: "2:34:00", altitude: 1240 {'}'};
            </div>
          </div>
        </div>

        {/* Option 5: Swiss/Minimalist */}
        <div className={styles.fontOptionCard}>
          <div className={styles.fontOptionHeader}>
            <h3>Option 5: Swiss/Minimalist</h3>
            <span className={styles.fontOptionTagHighlight}>Recommended</span>
          </div>
          <p className={styles.fontOptionDesc}>Clean European design, cartographic feel (fits maps/flight paths)</p>
          <div className={styles.fontOptionDemo} style={{ fontFamily: "Geist, 'Helvetica Neue', Arial, sans-serif" }}>
            <div className={styles.fontOptionHeading} style={{ fontFamily: "Geist, 'Helvetica Neue', sans-serif", fontWeight: 600 }}>
              Flight Statistics Dashboard
            </div>
            <div className={styles.fontOptionBody}>
              Track your paragliding flights with detailed metrics. Duration: 2h 34m | Max Altitude: 1,240m | Distance: 45.2km
            </div>
            <div className={styles.fontOptionMono} style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace" }}>
              const flight = {'{'} duration: "2:34:00", altitude: 1240 {'}'};
            </div>
          </div>
        </div>
      </section>

      {/* Colors Section */}
      <section id="colors" className={styles.section}>
        <h2 className={styles.sectionTitle}>Colors</h2>

        <h3 className={styles.subsectionTitle}>Primary Colors</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-primary" label="Primary" />
          <ColorSwatch name="--color-primary-hover" label="Primary Hover" />
          <ColorSwatch name="--color-primary-light" label="Primary Light" />
        </div>

        <h3 className={styles.subsectionTitle}>Secondary Colors</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-secondary" label="Secondary" />
          <ColorSwatch name="--color-secondary-hover" label="Secondary Hover" />
        </div>

        <h3 className={styles.subsectionTitle}>Strava Brand</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-strava" label="Strava" />
          <ColorSwatch name="--color-strava-hover" label="Strava Hover" />
          <ColorSwatch name="--color-strava-light" label="Strava Light" />
        </div>

        <h3 className={styles.subsectionTitle}>Backgrounds & Surfaces</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-background" label="Background" bordered />
          <ColorSwatch name="--color-surface" label="Surface" bordered />
          <ColorSwatch name="--color-surface-elevated" label="Surface Elevated" bordered />
        </div>

        <h3 className={styles.subsectionTitle}>Borders</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-border" label="Border" bordered />
          <ColorSwatch name="--color-border-light" label="Border Light" bordered />
        </div>

        <h3 className={styles.subsectionTitle}>Text Colors</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-text-primary" label="Text Primary" />
          <ColorSwatch name="--color-text-secondary" label="Text Secondary" />
          <ColorSwatch name="--color-text-muted" label="Text Muted" />
          <ColorSwatch name="--color-text-inverse" label="Text Inverse" bordered />
        </div>

        <h3 className={styles.subsectionTitle}>Semantic Colors</h3>
        <div className={styles.colorGrid}>
          <ColorSwatch name="--color-success" label="Success" />
          <ColorSwatch name="--color-warning" label="Warning" />
          <ColorSwatch name="--color-error" label="Error" />
        </div>
      </section>

      {/* Typography Section */}
      <section id="typography" className={styles.section}>
        <h2 className={styles.sectionTitle}>Typography</h2>

        <h3 className={styles.subsectionTitle}>Font Families</h3>
        <div className={styles.fontFamilyDemo}>
          <div className={styles.fontDemo}>
            <span className={styles.fontLabel}>--font-family-base</span>
            <p style={{ fontFamily: 'var(--font-family-base)' }}>
              The quick brown fox jumps over the lazy dog. 0123456789
            </p>
          </div>
          <div className={styles.fontDemo}>
            <span className={styles.fontLabel}>--font-family-mono</span>
            <p style={{ fontFamily: 'var(--font-family-mono)' }}>
              The quick brown fox jumps over the lazy dog. 0123456789
            </p>
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Font Sizes</h3>
        <div className={styles.typographyScale}>
          <TypeSample size="5xl" label="--font-size-5xl (3rem / 48px)" />
          <TypeSample size="4xl" label="--font-size-4xl (2.25rem / 36px)" />
          <TypeSample size="3xl" label="--font-size-3xl (1.875rem / 30px)" />
          <TypeSample size="2xl" label="--font-size-2xl (1.5rem / 24px)" />
          <TypeSample size="xl" label="--font-size-xl (1.25rem / 20px)" />
          <TypeSample size="lg" label="--font-size-lg (1.125rem / 18px)" />
          <TypeSample size="base" label="--font-size-base (1rem / 16px)" />
          <TypeSample size="sm" label="--font-size-sm (0.875rem / 14px)" />
          <TypeSample size="xs" label="--font-size-xs (0.75rem / 12px)" />
        </div>

        <h3 className={styles.subsectionTitle}>Font Weights</h3>
        <div className={styles.fontWeights}>
          <div className={styles.weightSample} style={{ fontWeight: 400 }}>
            <span className={styles.weightLabel}>Normal (400)</span>
            The quick brown fox
          </div>
          <div className={styles.weightSample} style={{ fontWeight: 500 }}>
            <span className={styles.weightLabel}>Medium (500)</span>
            The quick brown fox
          </div>
          <div className={styles.weightSample} style={{ fontWeight: 600 }}>
            <span className={styles.weightLabel}>Semibold (600)</span>
            The quick brown fox
          </div>
          <div className={styles.weightSample} style={{ fontWeight: 700 }}>
            <span className={styles.weightLabel}>Bold (700)</span>
            The quick brown fox
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Headings</h3>
        <div className={styles.headingsDemo}>
          <h1>Heading 1 - Page Title</h1>
          <h2>Heading 2 - Section Title</h2>
          <h3>Heading 3 - Subsection</h3>
          <h4>Heading 4 - Card Title</h4>
          <h5>Heading 5 - Small Heading</h5>
          <h6>Heading 6 - Smallest Heading</h6>
        </div>

        <h3 className={styles.subsectionTitle}>Body Text</h3>
        <div className={styles.bodyTextDemo}>
          <p>
            This is a paragraph with the default body text styling. It uses the secondary text color
            and relaxed line height for comfortable reading. Paragraphs have bottom margin for proper spacing.
          </p>
          <p>
            Another paragraph demonstrating the consistent spacing between text blocks. Good typography
            creates hierarchy and guides the reader through content naturally.
          </p>
        </div>
      </section>

      {/* Spacing Section */}
      <section id="spacing" className={styles.section}>
        <h2 className={styles.sectionTitle}>Spacing</h2>
        <p className={styles.sectionDesc}>Based on a 4px (0.25rem) unit scale</p>

        <div className={styles.spacingScale}>
          <SpacingSample token="--space-1" size="0.25rem" pixels="4px" />
          <SpacingSample token="--space-2" size="0.5rem" pixels="8px" />
          <SpacingSample token="--space-3" size="0.75rem" pixels="12px" />
          <SpacingSample token="--space-4" size="1rem" pixels="16px" />
          <SpacingSample token="--space-5" size="1.25rem" pixels="20px" />
          <SpacingSample token="--space-6" size="1.5rem" pixels="24px" />
          <SpacingSample token="--space-8" size="2rem" pixels="32px" />
          <SpacingSample token="--space-10" size="2.5rem" pixels="40px" />
          <SpacingSample token="--space-12" size="3rem" pixels="48px" />
          <SpacingSample token="--space-16" size="4rem" pixels="64px" />
          <SpacingSample token="--space-20" size="5rem" pixels="80px" />
          <SpacingSample token="--space-24" size="6rem" pixels="96px" />
        </div>
      </section>

      {/* Border Radius Section */}
      <section id="borders" className={styles.section}>
        <h2 className={styles.sectionTitle}>Border Radius</h2>

        <div className={styles.radiusGrid}>
          <RadiusSample token="--border-radius-sm" label="sm (4px)" />
          <RadiusSample token="--border-radius-base" label="base (6px)" />
          <RadiusSample token="--border-radius-md" label="md (8px)" />
          <RadiusSample token="--border-radius-lg" label="lg (12px)" />
          <RadiusSample token="--border-radius-xl" label="xl (16px)" />
          <RadiusSample token="--border-radius-2xl" label="2xl (24px)" />
          <RadiusSample token="--border-radius-full" label="full (circle)" />
        </div>
      </section>

      {/* Shadows Section */}
      <section id="shadows" className={styles.section}>
        <h2 className={styles.sectionTitle}>Shadows / Elevation</h2>

        <div className={styles.shadowGrid}>
          <ShadowSample token="--shadow-sm" label="shadow-sm" />
          <ShadowSample token="--shadow-base" label="shadow-base" />
          <ShadowSample token="--shadow-md" label="shadow-md" />
          <ShadowSample token="--shadow-lg" label="shadow-lg" />
          <ShadowSample token="--shadow-xl" label="shadow-xl" />
        </div>
      </section>

      {/* Buttons Section */}
      <section id="buttons" className={styles.section}>
        <h2 className={styles.sectionTitle}>Buttons</h2>

        <h3 className={styles.subsectionTitle}>Primary Buttons</h3>
        <div className={styles.buttonRow}>
          <button className={styles.buttonPrimary}>Primary Button</button>
          <button className={styles.buttonPrimary} disabled>Disabled</button>
        </div>

        <h3 className={styles.subsectionTitle}>Secondary Buttons</h3>
        <div className={styles.buttonRow}>
          <button className={styles.buttonSecondary}>Secondary Button</button>
          <button className={styles.buttonSecondary} disabled>Disabled</button>
        </div>

        <h3 className={styles.subsectionTitle}>Action Buttons</h3>
        <div className={styles.buttonRow}>
          <button className={styles.buttonAction}>Action Button</button>
        </div>

        <h3 className={styles.subsectionTitle}>Strava Button</h3>
        <div className={styles.buttonRow}>
          <button className={styles.buttonStrava}>
            <svg className={styles.stravaIcon} viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.33 14.544h4.168"/>
            </svg>
            Connect with Strava
          </button>
        </div>

        <h3 className={styles.subsectionTitle}>Button Sizes</h3>
        <div className={styles.buttonRow}>
          <button className={`${styles.buttonPrimary} ${styles.buttonSm}`}>Small</button>
          <button className={styles.buttonPrimary}>Default</button>
          <button className={`${styles.buttonPrimary} ${styles.buttonLg}`}>Large</button>
        </div>
      </section>

      {/* Cards Section */}
      <section id="cards" className={styles.section}>
        <h2 className={styles.sectionTitle}>Cards</h2>

        <h3 className={styles.subsectionTitle}>Basic Card</h3>
        <div className={styles.cardDemo}>
          <div className={styles.card}>
            <h3>Card Title</h3>
            <p>This is a basic card component with standard padding, border, and shadow. Cards are used to group related content.</p>
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Interactive Card (Hover me)</h3>
        <div className={styles.cardDemo}>
          <a href="#" className={styles.cardInteractive} onClick={(e) => e.preventDefault()}>
            <h3>Interactive Card</h3>
            <p>This card has hover effects including elevation change, border color shift, and subtle transform.</p>
          </a>
        </div>

        <h3 className={styles.subsectionTitle}>Flight Card Style</h3>
        <div className={styles.cardDemo}>
          <div className={styles.cardFlight}>
            <div className={styles.cardFlightContent}>
              <div className={styles.cardFlightHeader}>
                <div>
                  <h3>Niviuk Ikuma 2</h3>
                  <span className={styles.cardFlightDate}>Dec 15, 2024</span>
                </div>
                <div className={styles.cardFlightMetrics}>
                  <div className={styles.metric}>
                    <span className={styles.metricValue}>2:34</span>
                    <span className={styles.metricLabel}>Duration</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricValue}>1,240m</span>
                    <span className={styles.metricLabel}>Max Alt</span>
                  </div>
                </div>
              </div>
              <div className={styles.cardFlightSites}>
                <div className={styles.cardFlightSite}>
                  <span className={styles.siteIcon}>🛫</span>
                  <div>
                    <span className={styles.siteLabel}>Takeoff</span>
                    <span className={styles.siteName}>Col de la Forclaz</span>
                  </div>
                </div>
                <span className={styles.siteArrow}>→</span>
                <div className={styles.cardFlightSite}>
                  <span className={styles.siteIcon}>🛬</span>
                  <div>
                    <span className={styles.siteLabel}>Landing</span>
                    <span className={styles.siteName}>Doussard</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Alerts Section */}
      <section id="alerts" className={styles.section}>
        <h2 className={styles.sectionTitle}>Alerts</h2>

        <div className={styles.alertDemo}>
          <div className={styles.alertSuccess}>
            <strong>Success!</strong> Your flight has been synced successfully.
          </div>
          <div className={styles.alertWarning}>
            <strong>Warning:</strong> Your Strava token will expire soon.
          </div>
          <div className={styles.alertError}>
            <strong>Error:</strong> Failed to connect to Strava API.
          </div>
          <div className={styles.alertInfo}>
            <strong>Info:</strong> New features are available in your dashboard.
          </div>
        </div>
      </section>

      {/* Form Elements Section */}
      <section id="forms" className={styles.section}>
        <h2 className={styles.sectionTitle}>Form Elements</h2>

        <h3 className={styles.subsectionTitle}>Text Inputs</h3>
        <div className={styles.formDemo}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Default Input</label>
            <input type="text" className={styles.input} placeholder="Enter text..." />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Disabled Input</label>
            <input type="text" className={styles.input} placeholder="Disabled" disabled />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Input with Error</label>
            <input type="text" className={`${styles.input} ${styles.inputError}`} placeholder="Invalid value" />
            <span className={styles.errorText}>This field is required</span>
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Select</h3>
        <div className={styles.formDemo}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Select Menu</label>
            <select className={styles.select}>
              <option>Select an option</option>
              <option>Option 1</option>
              <option>Option 2</option>
              <option>Option 3</option>
            </select>
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Textarea</h3>
        <div className={styles.formDemo}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Textarea</label>
            <textarea className={styles.textarea} rows={4} placeholder="Enter longer text..."></textarea>
          </div>
        </div>

        <h3 className={styles.subsectionTitle}>Checkboxes & Radios</h3>
        <div className={styles.formDemo}>
          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" className={styles.checkbox} defaultChecked />
              <span>Checkbox option 1</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" className={styles.checkbox} />
              <span>Checkbox option 2</span>
            </label>
          </div>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input type="radio" name="demo-radio" className={styles.radio} defaultChecked />
              <span>Radio option 1</span>
            </label>
            <label className={styles.radioLabel}>
              <input type="radio" name="demo-radio" className={styles.radio} />
              <span>Radio option 2</span>
            </label>
          </div>
        </div>
      </section>

      {/* Transitions Demo */}
      <section id="transitions" className={styles.section}>
        <h2 className={styles.sectionTitle}>Transitions</h2>
        <p className={styles.sectionDesc}>Hover over the boxes to see transition speeds</p>

        <div className={styles.transitionGrid}>
          <div className={styles.transitionBox} style={{ transition: 'var(--transition-fast)' }}>
            <span>Fast (150ms)</span>
          </div>
          <div className={styles.transitionBox} style={{ transition: 'var(--transition-base)' }}>
            <span>Base (200ms)</span>
          </div>
          <div className={styles.transitionBox} style={{ transition: 'var(--transition-slow)' }}>
            <span>Slow (300ms)</span>
          </div>
        </div>
      </section>
    </div>
  );
}

// Component helpers
function ColorSwatch({ name, label, bordered = false }: { name: string; label: string; bordered?: boolean }) {
  return (
    <div className={styles.colorSwatch}>
      <div
        className={`${styles.swatchBox} ${bordered ? styles.swatchBordered : ''}`}
        style={{ backgroundColor: `var(${name})` }}
      />
      <div className={styles.swatchInfo}>
        <span className={styles.swatchLabel}>{label}</span>
        <code className={styles.swatchToken}>{name}</code>
      </div>
    </div>
  );
}

function TypeSample({ size, label }: { size: string; label: string }) {
  return (
    <div className={styles.typeSample}>
      <span
        className={styles.typeSampleText}
        style={{ fontSize: `var(--font-size-${size})` }}
      >
        Aa
      </span>
      <span className={styles.typeSampleLabel}>{label}</span>
    </div>
  );
}

function SpacingSample({ token, size, pixels }: { token: string; size: string; pixels: string }) {
  return (
    <div className={styles.spacingSample}>
      <div className={styles.spacingBar} style={{ width: `var(${token})` }} />
      <div className={styles.spacingInfo}>
        <code className={styles.spacingToken}>{token}</code>
        <span className={styles.spacingValue}>{size} / {pixels}</span>
      </div>
    </div>
  );
}

function RadiusSample({ token, label }: { token: string; label: string }) {
  return (
    <div className={styles.radiusSample}>
      <div
        className={styles.radiusBox}
        style={{ borderRadius: `var(${token})` }}
      />
      <span className={styles.radiusLabel}>{label}</span>
      <code className={styles.radiusToken}>{token}</code>
    </div>
  );
}

function ShadowSample({ token, label }: { token: string; label: string }) {
  return (
    <div className={styles.shadowSample}>
      <div
        className={styles.shadowBox}
        style={{ boxShadow: `var(${token})` }}
      />
      <span className={styles.shadowLabel}>{label}</span>
      <code className={styles.shadowToken}>{token}</code>
    </div>
  );
}
