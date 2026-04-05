import { Fragment } from "react";
import { HerdLinkLogo } from "./HerdLinkLogo";

const resolutionOptions = [
  { id: "daily", value: "daily", iconClass: "fa-solid fa-calendar-day" },
  {
    id: "weekly",
    value: "weekly",
    iconClass: "fa-solid fa-calendar-week",
    defaultChecked: true,
  },
  {
    id: "monthly",
    value: "monthly",
    iconClass: "fa-solid fa-calendar-days",
  },
  {
    id: "yearly",
    value: "yearly",
    iconClass: "fa-regular fa-calendar-days",
  },
];

const animalOptions = [
  {
    id: "pig",
    value: "pig",
    iconClass: "fa-solid fa-pig",
    defaultChecked: true,
  },
  { id: "cow", value: "cow", iconClass: "fa-solid fa-cow" },
  { id: "sheep", value: "sheep", iconClass: "fa-solid fa-sheep" },
  { id: "poultry", value: "poultry", iconClass: "fa-solid fa-bird" },
];

export function LeftPanel() {
  return (
    <div id="col1">
      <div className="card">
        <div className="col1-top">
          <div className="card-header">
            <div className="header-row header-row-1">
              <div className="logo-container">
                <h4 className="app-title">HerdLink</h4>
                <div className="app-version">v0.5.1-alpha</div>
                <div className="app-credit">
                  <a
                    className="app-credit-link"
                    href="https://github.com/EvoLandEco/herdlink-web"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source Code
                  </a>
                </div>
              </div>
              <div className="logo-svg-container">
                <HerdLinkLogo />
              </div>
            </div>

            <div className="header-row header-row-2">
              <div className="csv-switcher upper-switcher">
                {resolutionOptions.map((option) => (
                  <Fragment key={option.id}>
                    <input
                      type="radio"
                      id={option.id}
                      name="csvResolution"
                      value={option.value}
                      defaultChecked={option.defaultChecked}
                    />
                    <label htmlFor={option.id}>
                      <i className={option.iconClass}></i>
                    </label>
                  </Fragment>
                ))}
              </div>
            </div>

            <div className="header-row header-row-3">
              <div className="animal-switcher csv-switcher lower-switcher disabled">
                {animalOptions.map((option) => (
                  <Fragment key={option.id}>
                    <input
                      type="radio"
                      id={option.id}
                      name="animalType"
                      value={option.value}
                      defaultChecked={option.defaultChecked}
                      disabled
                    />
                    <label htmlFor={option.id}>
                      <i className={option.iconClass}></i>
                    </label>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col1-bottom">
          <div id="tradeDistribution">
            <div className="trade-distribution-label">
              <i className="fa-regular fa-chart-scatter-bubble"></i> Gravity
              Model:
            </div>
          </div>
          <div id="tradeClusters">
            <div className="trade-clusters-label">
              <i className="fa-regular fa-circle-nodes"></i> Trade Clusters:
            </div>
          </div>
          <div id="tradeNodeDistribution">
            <div className="trade-node-distribution-label">
              <i className="fa-regular fa-chart-scatter-bubble"></i> Gravity
              Model (Node):
            </div>
          </div>
          <div id="tradeNodeInsight">
            <div className="trade-nodeinsight-label">
              <i className="fa-regular fa-circle-nodes"></i> Focus Insights:
            </div>

            <div
              id="tradeNodeInsightControls"
              className="trade-nodeinsight-controls"
            >
              <label htmlFor="tradeNodeInsightSelect">
                <i className="fa-solid fa-chart-column"></i> View:
              </label>
              <select id="tradeNodeInsightSelect" defaultValue="partnerBalance">
                <option value="partnerBalance">Partner balance</option>
                <option value="distanceProfile">Distance profile</option>
                <option value="communityMix">Community mixing</option>
              </select>
            </div>

            <div
              id="tradeNodeInsightSummary"
              className="trade-nodeinsight-summary"
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
