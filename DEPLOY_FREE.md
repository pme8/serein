# Déploiement gratuit (Render)

## Coût
- Plan: **0 €** (gratuit)

## Limites du gratuit
- Le service peut se mettre en veille (sleep)
- Premier chargement plus lent après inactivité
- Ressources limitées

## Étapes
1. Crée un compte Render
2. Mets ce projet sur GitHub
3. Dans Render, clique **New +** -> **Blueprint**
4. Sélectionne ton repo
5. Render lira automatiquement `render.yaml`
6. Clique **Apply**

## Variables sensibles
Les variables `SEREIN_JWT_SECRET` et `SEREIN_ENC_SECRET` sont générées automatiquement par Render.

## Important
Le fichier `data/db.json` est local au conteneur. Sur hébergement gratuit, les données peuvent être perdues après redéploiement/restart.
Pour des données durables, utilise une base externe (Supabase/Neon/Firebase).
