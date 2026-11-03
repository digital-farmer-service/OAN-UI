const lockImg = "/assets/lockImg.svg";

export default function AuthError() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      {/* Gradient border wrapper */}
      <div
        style={{
          padding: "1px",
          background: "var(--primary)",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "350px"
        }}
      >
        {/* Card content */}
        <div
          className="w-full bg-card"
          style={{
            borderRadius: "23px",
            overflow: "hidden",
            position: "relative"
          }}
        >
          <div
            style={{ backgroundColor: "rgba(128, 128, 128, 0.08)" }}
            className="flex w-full flex-col items-center space-y-6 p-10 text-center"
          >
            <img src={lockImg} alt="Locked" className="h-16 w-16" />

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Session could not be started
              </h1>
              <p className="text-sm font-normal leading-relaxed text-muted-foreground px-2">
                Please reload the page or reopen the app.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
