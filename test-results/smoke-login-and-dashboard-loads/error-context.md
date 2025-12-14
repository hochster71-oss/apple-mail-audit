# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - main [ref=e3]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - heading "Sign in" [level=3] [ref=e8]
          - paragraph [ref=e9]: Use the seeded demo account after running pnpm db:seed.
        - generic [ref=e10]:
          - generic [ref=e11]:
            - generic [ref=e12]:
              - text: Email
              - textbox "Email" [ref=e13]: demo@example.com
            - generic [ref=e14]:
              - text: Password
              - textbox "Password" [ref=e15]: demo12345
            - button "Signing in…" [disabled]
          - link "Back to dashboard" [ref=e17] [cursor=pointer]:
            - /url: /
    - contentinfo [ref=e18]:
      - generic [ref=e19]: Developed by Michael Hoch
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e25] [cursor=pointer]:
    - img [ref=e26]
  - alert [ref=e29]
```